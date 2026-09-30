-- ============================================================================
-- PokéTCG · Fase 2 · migración 0002 (mercado, precios en soles, tareas, mazos)
-- Pegar completo en Supabase → SQL Editor → Run. Idempotente: se puede ejecutar varias veces
-- (también después de cada bloque de la Fase 2) sin borrar datos.
-- Requiere que 0001_fase1.sql ya se haya ejecutado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Ajustes del mercado y tareas programadas
-- ----------------------------------------------------------------------------
insert into public.ajustes_globales (clave, valor) values
  ('pisos', '{"normal": 1, "especial": 2}'),
  ('comision', '{"valor": 0.05}'),
  ('fx_respaldo', '{"usd_pen": 3.75, "eur_pen": 4.20, "fuente": "respaldo"}')
on conflict (clave) do nothing;

create table if not exists public.tareas_programadas (
  id             bigserial primary key,
  nombre         text not null,                          -- 'renovacion_diaria'
  inicio         timestamptz not null default now(),
  fin            timestamptz,
  estado         text not null default 'en_curso',       -- en_curso | ok | error
  detalle        jsonb not null default '{}'::jsonb,     -- fecha, fase, renovadas, errores, fx, ...
  cursor         jsonb not null default '{}'::jsonb,
  bloqueo_hasta  timestamptz,
  constraint tareas_estado_valido check (estado in ('en_curso', 'ok', 'error'))
);
create index if not exists tareas_por_nombre_fecha on public.tareas_programadas (nombre, ((detalle->>'fecha')), inicio desc);

alter table public.tareas_programadas enable row level security;
drop policy if exists "tareas: ver admin" on public.tareas_programadas;
create policy "tareas: ver admin" on public.tareas_programadas for select using (public.es_admin());

-- ----------------------------------------------------------------------------
-- B. Publicaciones (la tabla va aquí porque la función de abajo la usa; se completa en el bloque B)
-- ----------------------------------------------------------------------------
create table if not exists public.publicaciones (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  entrada_id      uuid references public.entradas (id) on delete cascade,
  carta_id        text references public.cartas (id),
  cantidad        int not null default 1,
  tipo_precio     text not null default 'defecto',       -- defecto | manual
  precio_pen      numeric(10,2) not null default 0,
  fotos           text[] not null default '{}',
  estado          text not null default 'activa',        -- activa | pausada | reservada | vendida | retirada
  motivo_pausa    text,
  creada          timestamptz not null default now(),
  actualizada     timestamptz not null default now(),
  constraint publicaciones_cantidad check (cantidad >= 0),
  constraint publicaciones_tipo_precio check (tipo_precio in ('defecto', 'manual')),
  constraint publicaciones_estado check (estado in ('activa', 'pausada', 'reservada', 'vendida', 'retirada'))
);
create index if not exists publicaciones_por_usuario on public.publicaciones (usuario_id, estado);
create index if not exists publicaciones_por_carta on public.publicaciones (carta_id, estado);
alter table public.publicaciones enable row level security;
drop policy if exists "publicaciones propias" on public.publicaciones;
create policy "publicaciones propias" on public.publicaciones for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Cartas cuyo precio hay que renovar: las que están en colecciones (y en publicaciones) y no se
-- han actualizado desde `desde`. Solo servidor (service_role).
create or replace function public.cartas_por_renovar(desde timestamptz, limite int default 200)
returns table (carta_id text)
language sql
security definer
set search_path = public
stable
as $$
  with usadas as (
    select distinct e.carta_id from public.entradas e where e.carta_id is not null
    union
    select distinct p.carta_id from public.publicaciones p where p.estado in ('activa', 'pausada', 'reservada')
  )
  select u.carta_id
    from usadas u
    join public.cartas c on c.id = u.carta_id and not c.sin_datos
    left join public.precios pr on pr.carta_id = u.carta_id
   where pr.carta_id is null or pr.actualizado_en < desde
   limit limite;
$$;
revoke all on function public.cartas_por_renovar(timestamptz, int) from public, anon, authenticated;

-- Recalcula el precio de las publicaciones con precio por defecto (se define en el bloque B; aquí un
-- marcador para que la tarea diaria no falle antes de ese bloque).
create or replace function public.recalcular_publicaciones()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select '{"recalculadas": 0}'::jsonb;
$$;
revoke all on function public.recalcular_publicaciones() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- B. Cajas en venta, publicaciones con precio por defecto, fotos y sincronización
-- ----------------------------------------------------------------------------
alter table public.cajas add column if not exists en_venta boolean not null default false;
alter table public.cajas add column if not exists preguntar_venta boolean not null default true;

alter table public.publicaciones add column if not exists acabado text not null default '';
alter table public.publicaciones add column if not exists idioma text not null default '';
alter table public.publicaciones add column if not exists condicion text not null default '';
alter table public.publicaciones add column if not exists precio_mercado_pen numeric(10,2);
alter table public.publicaciones add column if not exists aviso text;   -- mensaje pendiente para el vendedor (p. ej. foto obligatoria)
create unique index if not exists publicaciones_una_por_entrada on public.publicaciones (entrada_id) where estado in ('activa', 'pausada', 'reservada');
create index if not exists publicaciones_mercado on public.publicaciones (estado, carta_id, precio_pen) where estado = 'activa';

-- Valor de mercado en soles de una carta según acabado (misma lógica que src/lib/precios-core.ts)
create or replace function public.valor_mercado_pen(p_carta_id text, p_acabado text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d jsonb;
  tp jsonb;
  cm jsonb;
  fx jsonb;
  usd_pen numeric;
  eur_pen numeric;
  k text;
  orden text[];
  v numeric;
begin
  select datos into d from public.precios where carta_id = p_carta_id;
  if d is null or coalesce((d->>'ok')::boolean, false) = false then return null; end if;
  select valor into fx from public.ajustes_globales where clave = 'fx';
  if fx is null or (fx->>'usd_pen') is null then select valor into fx from public.ajustes_globales where clave = 'fx_respaldo'; end if;
  usd_pen := coalesce((fx->>'usd_pen')::numeric, 3.75);
  eur_pen := coalesce((fx->>'eur_pen')::numeric, 4.20);
  tp := d->'tp';
  if tp is not null and jsonb_typeof(tp) = 'object' then
    orden := case p_acabado
      when 'Normal' then array['normal','unlimited','1st-edition','holofoil','unlimited-holofoil','reverse-holofoil']
      when 'Holo' then array['holofoil','unlimited-holofoil','1st-edition-holofoil','reverse-holofoil','normal']
      when 'Reverse' then array['reverse-holofoil','holofoil','unlimited-holofoil','normal']
      else array['normal','unlimited','holofoil','unlimited-holofoil','1st-edition-holofoil','1st-edition','reverse-holofoil'] end;
    foreach k in array orden loop
      if tp ? k then return round((tp->>k)::numeric * usd_pen, 2); end if;
    end loop;
    select (value)::numeric into v from jsonb_each_text(tp) limit 1;
    if v is not null then return round(v * usd_pen, 2); end if;
  end if;
  cm := d->'cm';
  if cm is not null and jsonb_typeof(cm) = 'object' then
    if p_acabado in ('Holo', 'Reverse') then v := coalesce((cm->>'holo')::numeric, (cm->>'trend')::numeric);
    else v := coalesce((cm->>'trend')::numeric, (cm->>'holo')::numeric); end if;
    if v is not null then return round(v * eur_pen, 2); end if;
  end if;
  return null;
end;
$$;

-- ¿Carta "brillante" (piso especial)? Reverse/Holo/Otra siempre; rarezas distintas de Common/Uncommon/Rare/Promo; ex, V, GX…
create or replace function public.es_brillante(p_carta_id text, p_acabado text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_acabado in ('Reverse', 'Holo', 'Otra')
      or exists (
        select 1 from public.cartas c where c.id = p_carta_id and (
          coalesce(c.rareza, '') not in ('Common', 'Uncommon', 'Rare', 'Promo', 'None', '')
          or c.nombre ~ '(\m(ex|EX|GX|V|VMAX|VSTAR|BREAK|LEGEND|Prism Star|TAG TEAM|LV\.X)\M|\mMega\M|Radiant|Shining|Crystal|☆)'
        )
      );
$$;

-- Precio por defecto = máx(piso, valor de mercado)
create or replace function public.precio_defecto_pen(p_carta_id text, p_acabado text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pisos jsonb;
  piso numeric;
  mercado numeric;
begin
  select valor into pisos from public.ajustes_globales where clave = 'pisos';
  piso := case when public.es_brillante(p_carta_id, p_acabado) then coalesce((pisos->>'especial')::numeric, 2) else coalesce((pisos->>'normal')::numeric, 1) end;
  mercado := public.valor_mercado_pen(p_carta_id, p_acabado);
  return greatest(piso, coalesce(mercado, 0));
end;
$$;

-- Al crear o editar una publicación: copia los datos de la entrada, calcula el precio por defecto,
-- limita la cantidad y aplica la regla de la foto (> S/ 50 sin foto → pausada).
create or replace function public.preparar_publicacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  if new.entrada_id is not null then
    select * into e from public.entradas where id = new.entrada_id;
    if e is null then raise exception 'La entrada no existe'; end if;
    if e.usuario_id <> new.usuario_id then raise exception 'La entrada no es tuya'; end if;
    new.carta_id := e.carta_id;
    new.acabado := coalesce(e.acabado, '');
    new.idioma := coalesce(e.idioma, '');
    new.condicion := coalesce(e.condicion, '');
    if new.cantidad > e.cantidad then new.cantidad := e.cantidad; end if;
  end if;
  if new.carta_id is null then raise exception 'Solo se pueden publicar cartas del catálogo'; end if;
  if new.cantidad < 1 and new.estado in ('activa', 'pausada') then new.estado := 'retirada'; end if;
  new.precio_mercado_pen := public.valor_mercado_pen(new.carta_id, new.acabado);
  if new.tipo_precio = 'defecto' then
    new.precio_pen := public.precio_defecto_pen(new.carta_id, new.acabado);
  else
    if new.precio_pen is null or new.precio_pen < 0.5 then raise exception 'El precio manual mínimo es S/ 0.50'; end if;
    new.precio_pen := round(new.precio_pen, 2);
  end if;
  -- foto obligatoria por encima de S/ 50
  if new.precio_pen > 50 and coalesce(array_length(new.fotos, 1), 0) = 0 then
    if new.estado = 'activa' then new.estado := 'pausada'; end if;
    if new.estado = 'pausada' then new.motivo_pausa := 'foto'; new.aviso := 'Esta publicación supera S/ 50: agrega una foto real de la carta para activarla.'; end if;
  elsif new.motivo_pausa = 'foto' then
    new.motivo_pausa := null; new.aviso := null;
    if tg_op = 'UPDATE' and old.estado = 'pausada' and new.estado = 'pausada' then new.estado := 'activa'; end if;
  end if;
  new.actualizada := now();
  return new;
end;
$$;
drop trigger if exists publicaciones_preparar on public.publicaciones;
create trigger publicaciones_preparar before insert or update on public.publicaciones for each row execute function public.preparar_publicacion();

-- Sincroniza las publicaciones cuando cambia una entrada (cantidad, acabado, idioma, caja) y publica
-- automáticamente lo que entra en una caja en venta.
create or replace function public.sincronizar_publicacion_entrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  venta boolean := false;
  p record;
begin
  if new.caja_id is not null then select en_venta into venta from public.cajas where id = new.caja_id; end if;
  select * into p from public.publicaciones where entrada_id = new.id and estado in ('activa', 'pausada', 'reservada') limit 1;
  if p is null then
    if venta and new.carta_id is not null and (tg_op = 'INSERT' or old.caja_id is distinct from new.caja_id) then
      insert into public.publicaciones (usuario_id, entrada_id, cantidad, tipo_precio) values (new.usuario_id, new.id, new.cantidad, 'defecto');
    end if;
    return new;
  end if;
  if p.estado = 'reservada' then return new; end if;
  update public.publicaciones
     set cantidad = case when venta then new.cantidad else least(cantidad, new.cantidad) end,
         acabado = coalesce(new.acabado, ''), idioma = coalesce(new.idioma, ''), condicion = coalesce(new.condicion, '')
   where id = p.id;
  return new;
end;
$$;
drop trigger if exists entradas_sincronizar_publicacion on public.entradas;
create trigger entradas_sincronizar_publicacion after insert or update of cantidad, acabado, idioma, condicion, caja_id on public.entradas for each row execute function public.sincronizar_publicacion_entrada();

-- Al marcar una caja "en venta" se publican todas sus cartas del catálogo; al desmarcarla no se retira nada.
create or replace function public.publicar_caja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.en_venta and not coalesce(old.en_venta, false) then
    insert into public.publicaciones (usuario_id, entrada_id, cantidad, tipo_precio)
    select e.usuario_id, e.id, e.cantidad, 'defecto'
      from public.entradas e
     where e.caja_id = new.id and e.carta_id is not null and e.cantidad > 0
       and not exists (select 1 from public.publicaciones p where p.entrada_id = e.id and p.estado in ('activa', 'pausada', 'reservada'));
    new.preguntar_venta := false;
  end if;
  return new;
end;
$$;
drop trigger if exists cajas_publicar on public.cajas;
create trigger cajas_publicar before update of en_venta on public.cajas for each row execute function public.publicar_caja();

-- Recalcula (tarea diaria) el precio de las publicaciones con precio por defecto y aplica la regla de la foto.
create or replace function public.recalcular_publicaciones()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  pausadas int;
begin
  update public.publicaciones p
     set precio_pen = public.precio_defecto_pen(p.carta_id, p.acabado),
         precio_mercado_pen = public.valor_mercado_pen(p.carta_id, p.acabado)
   where p.estado in ('activa', 'pausada') and p.tipo_precio = 'defecto';
  get diagnostics n = row_count;
  update public.publicaciones p set precio_mercado_pen = public.valor_mercado_pen(p.carta_id, p.acabado)
   where p.estado in ('activa', 'pausada') and p.tipo_precio = 'manual';
  select count(*) into pausadas from public.publicaciones where estado = 'pausada' and motivo_pausa = 'foto';
  return jsonb_build_object('recalculadas', n, 'pausadas_por_foto', pausadas);
end;
$$;
revoke all on function public.recalcular_publicaciones() from public, anon, authenticated;

-- Vista pública del mercado: solo publicaciones activas y sin datos personales (usuario, no DNI ni celular)
create or replace view public.mercado as
  select p.id, p.carta_id, p.cantidad, p.precio_pen, p.acabado, p.idioma, p.condicion, p.fotos, p.creada, p.actualizada,
         u.username as vendedor, p.usuario_id as vendedor_id
    from public.publicaciones p
    join public.perfiles u on u.id = p.usuario_id
   where p.estado = 'activa' and p.cantidad > 0;
grant select on public.mercado to authenticated, anon;

-- Fotos de publicaciones: bucket público; cada usuario sube/borra solo en su carpeta (<uid>/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-publicaciones', 'fotos-publicaciones', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "fotos: ver" on storage.objects;
create policy "fotos: ver" on storage.objects for select using (bucket_id = 'fotos-publicaciones');
drop policy if exists "fotos: subir propias" on storage.objects;
create policy "fotos: subir propias" on storage.objects for insert with check (bucket_id = 'fotos-publicaciones' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "fotos: editar propias" on storage.objects;
create policy "fotos: editar propias" on storage.objects for update using (bucket_id = 'fotos-publicaciones' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "fotos: borrar propias" on storage.objects;
create policy "fotos: borrar propias" on storage.objects for delete using (bucket_id = 'fotos-publicaciones' and (storage.foldername(name))[1] = auth.uid()::text);

-- Tiempo real para el mercado
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.publicaciones; exception when duplicate_object then null; end;
  end if;
end $$;
