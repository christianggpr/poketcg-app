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

