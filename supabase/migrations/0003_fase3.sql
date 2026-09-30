-- ============================================================================
-- PokéTCG · Fase 3 · migración 0003 (órdenes, pagos por Yape, tiendas, saldos, retiros, notificaciones)
-- Pegar completo en Supabase → SQL Editor → Run. Idempotente: se puede ejecutar varias veces
-- (también después de cada bloque de la Fase 3) sin borrar datos.
-- Requiere 0001_fase1.sql y 0002_fase2.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Roles y perfil: cuentas de tienda, verificación del celular por WhatsApp
-- ----------------------------------------------------------------------------
alter table public.perfiles drop constraint if exists perfiles_rol_valido;
alter table public.perfiles add constraint perfiles_rol_valido check (rol in ('usuario', 'admin', 'tienda'));
alter table public.perfiles add column if not exists tienda_id uuid;                      -- sede que atiende (rol tienda)
alter table public.perfiles add column if not exists celular_verificado_en timestamptz;   -- verificado por WhatsApp
alter table public.perfiles add column if not exists codigo_verificacion text;
alter table public.perfiles add column if not exists codigo_verificacion_expira timestamptz;

-- El usuario no puede tocar rol, DNI, correo, tienda ni la verificación del celular (solo servidor/admin)
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.rol := old.rol;
    new.dni := old.dni;
    new.email := old.email;
    new.id := old.id;
    new.creado_en := old.creado_en;
    new.tienda_id := old.tienda_id;
    new.celular_verificado_en := old.celular_verificado_en;
    new.codigo_verificacion := old.codigo_verificacion;
    new.codigo_verificacion_expira := old.codigo_verificacion_expira;
    -- si cambia el celular, hay que verificarlo otra vez
    if new.telefono is distinct from old.telefono then new.celular_verificado_en := null; end if;
  end if;
  new.username := lower(new.username);
  new.actualizado_en := now();
  return new;
end;
$$;

-- ¿La sesión es de una cuenta de tienda? (devuelve su sede)
create or replace function public.mi_tienda()
returns uuid
language sql
stable
as $$
  select tienda_id from public.perfiles where id = auth.uid() and rol = 'tienda';
$$;

-- ----------------------------------------------------------------------------
-- A. Tiendas / sedes de entrega (las administra el administrador)
-- ----------------------------------------------------------------------------
create table if not exists public.tiendas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  distrito      text not null default '',
  direccion     text not null default '',
  referencia    text not null default '',
  horario       text not null default '',              -- texto libre: "L–S 10:00–20:00"
  dias_abierto  int[] not null default '{1,2,3,4,5,6}', -- 0 = domingo … 6 = sábado
  telefono      text,
  activa        boolean not null default true,
  creada        timestamptz not null default now(),
  actualizada   timestamptz not null default now()
);
alter table public.tiendas enable row level security;
drop policy if exists "tiendas: ver" on public.tiendas;
create policy "tiendas: ver" on public.tiendas for select using (activa or public.es_admin() or id = public.mi_tienda());
drop policy if exists "tiendas: admin" on public.tiendas;
create policy "tiendas: admin" on public.tiendas for all using (public.es_admin()) with check (public.es_admin());
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_tienda_fk') then
    alter table public.perfiles add constraint perfiles_tienda_fk foreign key (tienda_id) references public.tiendas (id) on delete set null;
  end if;
end $$;

-- Ajustes de pagos (editables en /admin): Yape/Plin de la app, WhatsApp, días de pago, plazos.
-- Pago a vendedores: todos los días, apenas se confirma la entrega (liberacion_dias = 0).
insert into public.ajustes_globales (clave, valor, actualizado_en)
values ('pagos', '{"yape_numero":"949114582","yape_nombre":"CHRISTIAN GABRIEL PAUCCA ROMERO","metodos":["Yape","Plin"],"whatsapp":"949114582","dias_pago":[0,1,2,3,4,5,6],"reserva_min":30,"confirmacion_dias":3,"liberacion_dias":0,"retiro_minimo":0}', now())
on conflict (clave) do nothing;

-- Primera tienda de entrega (se puede editar o desactivar en /admin)
insert into public.tiendas (nombre, distrito, direccion, referencia, horario, dias_abierto)
select 'TCG Center Perú', 'Lince, Lima', 'Av. Arenales 1624', 'Galería FullMarket, 2.º piso', 'Lunes a sábado de 12:00 a 20:00', '{1,2,3,4,5,6}'
where not exists (select 1 from public.tiendas where nombre = 'TCG Center Perú');

-- ----------------------------------------------------------------------------
-- A. Stock: copias vendidas pendientes de entrega (no se venden dos veces)
-- ----------------------------------------------------------------------------
alter table public.publicaciones add column if not exists vendidas int not null default 0;

create or replace function public.preparar_publicacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  interno boolean := coalesce(current_setting('poketcg.interno', true), '') = '1';
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
  -- reservas y ventas: solo las funciones del mercado tocan `reservadas` y `vendidas`
  if tg_op = 'UPDATE' and not interno then new.reservadas := old.reservadas; new.vendidas := old.vendidas; end if;
  if tg_op = 'INSERT' then new.reservadas := 0; new.vendidas := 0; end if;
  if new.estado in ('pausada', 'retirada') and not interno then
    if new.vendidas > 0 then raise exception 'Hay % copias vendidas pendientes de entrega: no se puede pausar ni retirar', new.vendidas; end if;
    new.reservadas := 0;
  elsif new.cantidad < new.reservadas + new.vendidas then new.cantidad := new.reservadas + new.vendidas; end if;
  if new.estado = 'activa' and new.reservadas + new.vendidas >= new.cantidad and new.reservadas + new.vendidas > 0 then new.estado := 'reservada'; end if;
  if new.estado = 'reservada' and new.reservadas + new.vendidas < new.cantidad then new.estado := 'activa'; end if;
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

-- Vista pública con las copias realmente disponibles: cantidad − reservadas − vendidas
drop view if exists public.mercado;
create view public.mercado as
  select p.id, p.carta_id, p.cantidad, p.reservadas, p.cantidad - p.reservadas - p.vendidas as disponibles, p.precio_pen, p.tipo_precio,
         p.precio_mercado_pen, p.acabado, p.idioma, p.condicion, p.fotos, p.creada, p.actualizada,
         u.username as vendedor, p.usuario_id as vendedor_id
    from public.publicaciones p
    join public.perfiles u on u.id = p.usuario_id
   where p.estado = 'activa' and p.cantidad - p.reservadas - p.vendidas > 0;
grant select on public.mercado to authenticated, anon;

create or replace function public.reservar_copia(p_publicacion uuid, p_cantidad int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  p record;
  r record;
  ocupadas int;
  disponibles int;
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  if p_cantidad is null or p_cantidad < 1 then return jsonb_build_object('ok', false, 'error', 'Cantidad inválida'); end if;
  select * into p from public.publicaciones where id = p_publicacion for update;   -- bloqueo: las demás reservas esperan
  if p is null then return jsonb_build_object('ok', false, 'error', 'La publicación ya no existe'); end if;
  if p.usuario_id = yo then return jsonb_build_object('ok', false, 'error', 'No puedes comprar tus propias cartas'); end if;
  if p.estado not in ('activa', 'reservada') then return jsonb_build_object('ok', false, 'error', 'La publicación no está disponible'); end if;
  update public.reservas set estado = 'vencida' where publicacion_id = p.id and estado = 'activa' and orden_id is null and expira < now();
  select * into r from public.reservas where publicacion_id = p.id and comprador_id = yo and estado = 'activa' and orden_id is null;
  select coalesce(sum(cantidad), 0) into ocupadas from public.reservas where publicacion_id = p.id and estado = 'activa' and (comprador_id <> yo or orden_id is not null);
  disponibles := p.cantidad - p.vendidas - ocupadas;   -- lo que puedo llevarme en total (incluida mi reserva actual)
  if p_cantidad > disponibles then
    return jsonb_build_object('ok', false, 'error', case when disponibles <= 0 then 'Ya no quedan copias disponibles' else format('Solo quedan %s copias disponibles', disponibles) end, 'disponibles', greatest(disponibles, 0));
  end if;
  perform set_config('poketcg.interno', '1', true);
  if r is null then
    insert into public.reservas (publicacion_id, comprador_id, cantidad, precio_pen) values (p.id, yo, p_cantidad, p.precio_pen) returning * into r;
  else
    update public.reservas set cantidad = p_cantidad, precio_pen = p.precio_pen, expira = now() + interval '24 hours' where id = r.id returning * into r;
  end if;
  update public.publicaciones set reservadas = ocupadas + p_cantidad where id = p.id;
  return jsonb_build_object('ok', true, 'reserva_id', r.id, 'cantidad', r.cantidad, 'precio_pen', r.precio_pen, 'expira', r.expira, 'disponibles', p.cantidad - p.vendidas - ocupadas - p_cantidad);
end;
$$;

-- Recalcula `reservadas` de una publicación (y su estado) a partir de las reservas activas.
create or replace function public.recalcular_reservadas(p_publicacion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select coalesce(sum(cantidad), 0) into n from public.reservas where publicacion_id = p_publicacion and estado = 'activa';
  perform set_config('poketcg.interno', '1', true);
  update public.publicaciones set reservadas = n where id = p_publicacion;
end;
$$;

create or replace function public.liberar_reserva(p_reserva uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  pid uuid;
  p record;
  r record;
begin
  select publicacion_id into pid from public.reservas where id = p_reserva and comprador_id = yo and estado = 'activa';
  if pid is null then return jsonb_build_object('ok', false, 'error', 'La reserva no existe'); end if;
  select * into p from public.publicaciones where id = pid for update;   -- mismo orden de bloqueo que reservar_copia
  select * into r from public.reservas where id = p_reserva and estado = 'activa' for update;
  if r is null then return jsonb_build_object('ok', false, 'error', 'La reserva ya no está activa'); end if;
  if r.orden_id is not null then return jsonb_build_object('ok', false, 'error', 'Esta reserva ya es parte de una compra: cancela la compra desde Mis compras'); end if;
  update public.reservas set estado = 'liberada' where id = r.id;
  perform public.recalcular_reservadas(p.id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- A. Pagos (Yape + voucher), órdenes (una por vendedor), ítems y notificaciones
-- ----------------------------------------------------------------------------
create table if not exists public.pagos (
  id             uuid primary key default gen_random_uuid(),
  numero         bigserial,
  comprador_id   uuid not null references public.perfiles (id) on delete cascade,
  tienda_id      uuid references public.tiendas (id),
  monto          numeric(10,2) not null,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'revision', 'confirmado', 'rechazado', 'vencido', 'cancelado')),
  voucher_url    text,
  n_operacion    text,
  motivo         text,
  expira         timestamptz not null,
  comprobante_en timestamptz,
  revisado_en    timestamptz,
  revisado_por   uuid,
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now()
);
create index if not exists pagos_por_comprador on public.pagos (comprador_id, estado);
create index if not exists pagos_por_estado on public.pagos (estado, creado desc);
create index if not exists pagos_por_operacion on public.pagos (n_operacion) where n_operacion is not null;

create table if not exists public.ordenes (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigserial,
  pago_id            uuid not null references public.pagos (id) on delete cascade,
  comprador_id       uuid not null references public.perfiles (id) on delete cascade,
  vendedor_id        uuid not null references public.perfiles (id) on delete cascade,
  tienda_id          uuid references public.tiendas (id),
  estado             text not null default 'reservada' check (estado in ('reservada', 'revision', 'pago_confirmado', 'en_tienda', 'entregada', 'saldo_liberado', 'pago_rechazado', 'cancelada', 'vencida', 'disputa')),
  subtotal           numeric(10,2) not null,
  comision           numeric(10,2) not null,
  neto_vendedor      numeric(10,2) not null,
  codigo_retiro      text,
  pago_confirmado_en timestamptz,
  fecha_limite       date,              -- sábado límite para dejar la carta en la tienda
  fecha_entrega      date,              -- fecha elegida por el vendedor
  en_tienda_en       timestamptz,
  foto_entrega_url   text,
  entregada_en       timestamptz,
  entregada_por      text,              -- 'comprador' | 'tienda' | 'automatica'
  saldo_liberado_en  timestamptz,
  motivo             text,
  creada             timestamptz not null default now(),
  actualizada        timestamptz not null default now()
);
create index if not exists ordenes_por_comprador on public.ordenes (comprador_id, estado);
create index if not exists ordenes_por_vendedor on public.ordenes (vendedor_id, estado);
create index if not exists ordenes_por_tienda on public.ordenes (tienda_id, estado);
create index if not exists ordenes_por_pago on public.ordenes (pago_id);

create table if not exists public.orden_items (
  id             uuid primary key default gen_random_uuid(),
  orden_id       uuid not null references public.ordenes (id) on delete cascade,
  publicacion_id uuid references public.publicaciones (id) on delete set null,
  reserva_id     uuid references public.reservas (id) on delete set null,
  entrada_id     uuid references public.entradas (id) on delete set null,
  vendedor_id    uuid not null,
  carta_id       text not null,
  cantidad       int not null check (cantidad > 0),
  precio_pen     numeric(10,2) not null,
  acabado        text not null default '',
  idioma         text not null default '',
  condicion      text not null default ''
);
create index if not exists orden_items_por_orden on public.orden_items (orden_id);

alter table public.reservas add column if not exists orden_id uuid references public.ordenes (id) on delete set null;

-- Bandeja de notificaciones (app) + correo/WhatsApp pendientes de envío por el servidor
create table if not exists public.notificaciones (
  id          bigserial primary key,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  tipo        text not null,
  titulo      text not null,
  cuerpo      text not null default '',
  enlace      text,
  datos       jsonb not null default '{}'::jsonb,
  canales     text[] not null default '{app}',   -- app, correo, whatsapp
  leida_en    timestamptz,
  enviada_en  timestamptz,                       -- correo enviado por el servidor
  creada      timestamptz not null default now()
);
create index if not exists notificaciones_por_usuario on public.notificaciones (usuario_id, creada desc);
create index if not exists notificaciones_pendientes on public.notificaciones (creada) where enviada_en is null;

-- RLS
alter table public.pagos enable row level security;
alter table public.ordenes enable row level security;
alter table public.orden_items enable row level security;
alter table public.notificaciones enable row level security;
drop policy if exists "pagos: ver" on public.pagos;
create policy "pagos: ver" on public.pagos for select using (comprador_id = auth.uid() or public.es_admin());
drop policy if exists "ordenes: ver" on public.ordenes;
create policy "ordenes: ver" on public.ordenes for select
  using (comprador_id = auth.uid() or vendedor_id = auth.uid() or public.es_admin() or (tienda_id is not null and tienda_id = public.mi_tienda()));
drop policy if exists "orden_items: ver" on public.orden_items;
create policy "orden_items: ver" on public.orden_items for select
  using (exists (select 1 from public.ordenes o where o.id = orden_id and (o.comprador_id = auth.uid() or o.vendedor_id = auth.uid() or public.es_admin() or (o.tienda_id is not null and o.tienda_id = public.mi_tienda()))));
drop policy if exists "notificaciones: ver propias" on public.notificaciones;
create policy "notificaciones: ver propias" on public.notificaciones for select using (usuario_id = auth.uid());
drop policy if exists "notificaciones: marcar leidas" on public.notificaciones;
create policy "notificaciones: marcar leidas" on public.notificaciones for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
-- (sin más políticas de escritura: todo pasa por las funciones de abajo o el servidor)

-- Helper: crear una notificación (app siempre; correo/whatsapp los envía el servidor después)
create or replace function public.notificar(p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_enlace text default null, p_datos jsonb default '{}'::jsonb, p_canales text[] default '{app,correo}')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  nid bigint;
begin
  if p_usuario is null then return null; end if;
  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, enlace, datos, canales)
  values (p_usuario, p_tipo, p_titulo, coalesce(p_cuerpo, ''), p_enlace, coalesce(p_datos, '{}'::jsonb), coalesce(p_canales, '{app}'))
  returning id into nid;
  return nid;
end;
$$;
revoke all on function public.notificar(uuid, text, text, text, text, jsonb, text[]) from public, anon, authenticated;

create or replace function public.notificar_admins(p_tipo text, p_titulo text, p_cuerpo text, p_enlace text default null, p_datos jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  for a in select id from public.perfiles where rol = 'admin' loop
    perform public.notificar(a.id, p_tipo, p_titulo, p_cuerpo, p_enlace, p_datos, '{app,correo}');
  end loop;
end;
$$;
revoke all on function public.notificar_admins(text, text, text, text, jsonb) from public, anon, authenticated;

-- Ajustes de pagos como registro
create or replace function public.ajustes_pagos()
returns jsonb
language sql
stable
as $$
  select coalesce((select valor from public.ajustes_globales where clave = 'pagos'), '{}'::jsonb)
         || jsonb_build_object('comision', coalesce((select (valor->>'valor')::numeric from public.ajustes_globales where clave = 'comision'), 0.05));
$$;

-- Fecha límite de entrega: pago confirmado de domingo a jueves → sábado de esa semana; viernes o sábado → sábado de la siguiente.
create or replace function public.fecha_limite_entrega(p_confirmado timestamptz)
returns date
language sql
stable
as $$
  select case when extract(dow from (p_confirmado at time zone 'America/Lima'))::int in (5, 6)
              then ((p_confirmado at time zone 'America/Lima')::date + (6 - extract(dow from (p_confirmado at time zone 'America/Lima'))::int) + 7)
              else ((p_confirmado at time zone 'America/Lima')::date + (6 - extract(dow from (p_confirmado at time zone 'America/Lima'))::int)) end;
$$;

-- Nombre corto de una carta para textos (nombre + colección + número)
create or replace function public.nombre_carta_texto(p_carta text)
returns text
language sql
stable
as $$
  select coalesce(c.nombre_es, c.nombre) || ' (' || coalesce(s.abreviatura, s.nombre) || ' ' || c.numero || ')'
    from public.cartas c join public.colecciones_tcg s on s.id = c.coleccion_id where c.id = p_carta;
$$;

-- Comprar: convierte mi carrito en un pago (Yape) con una orden por vendedor. La reserva vence en `reserva_min` minutos si no se sube el voucher.
create or replace function public.crear_pago(p_tienda uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  aj jsonb := public.ajustes_pagos();
  minutos int := coalesce((public.ajustes_pagos()->>'reserva_min')::int, 30);
  comision numeric := coalesce((public.ajustes_pagos()->>'comision')::numeric, 0.05);
  r record;
  p record;
  v_pago uuid;
  v_orden uuid;
  total numeric := 0;
  vendedores uuid[] := '{}';
  v uuid;
  sub numeric;
  n_items int := 0;
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  if not exists (select 1 from public.tiendas where id = p_tienda and activa) then return jsonb_build_object('ok', false, 'error', 'Elige una tienda de entrega'); end if;
  if exists (select 1 from public.pagos where comprador_id = yo and estado = 'pendiente' and expira > now()) then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes una compra esperando el comprobante: termínala o cancélala en Mis compras');
  end if;
  -- reservas del carrito (activas, sin orden, no vencidas), con bloqueo de sus publicaciones
  for r in select res.* from public.reservas res where res.comprador_id = yo and res.estado = 'activa' and res.orden_id is null and res.expira > now() order by res.creada loop
    select * into p from public.publicaciones where id = r.publicacion_id for update;
    if p is null or p.estado not in ('activa', 'reservada') then return jsonb_build_object('ok', false, 'error', 'Una publicación de tu carrito ya no está disponible: quítala e inténtalo de nuevo'); end if;
    if p.usuario_id = yo then return jsonb_build_object('ok', false, 'error', 'No puedes comprar tus propias cartas'); end if;
    n_items := n_items + 1;
    total := total + r.cantidad * r.precio_pen;
    if not (p.usuario_id = any(vendedores)) then vendedores := vendedores || p.usuario_id; end if;
  end loop;
  if n_items = 0 then return jsonb_build_object('ok', false, 'error', 'Tu carrito está vacío'); end if;
  insert into public.pagos (comprador_id, tienda_id, monto, expira) values (yo, p_tienda, round(total, 2), now() + make_interval(mins => minutos)) returning id into v_pago;
  foreach v in array vendedores loop
    select coalesce(sum(res.cantidad * res.precio_pen), 0) into sub
      from public.reservas res join public.publicaciones pu on pu.id = res.publicacion_id
     where res.comprador_id = yo and res.estado = 'activa' and res.orden_id is null and pu.usuario_id = v;
    insert into public.ordenes (pago_id, comprador_id, vendedor_id, tienda_id, subtotal, comision, neto_vendedor)
    values (v_pago, yo, v, p_tienda, round(sub, 2), round(sub * comision, 2), round(sub, 2) - round(sub * comision, 2)) returning id into v_orden;
    insert into public.orden_items (orden_id, publicacion_id, reserva_id, entrada_id, vendedor_id, carta_id, cantidad, precio_pen, acabado, idioma, condicion)
    select v_orden, pu.id, res.id, pu.entrada_id, pu.usuario_id, pu.carta_id, res.cantidad, res.precio_pen, pu.acabado, pu.idioma, pu.condicion
      from public.reservas res join public.publicaciones pu on pu.id = res.publicacion_id
     where res.comprador_id = yo and res.estado = 'activa' and res.orden_id is null and pu.usuario_id = v;
    update public.reservas res set orden_id = v_orden, expira = now() + make_interval(mins => minutos)
      from public.publicaciones pu where pu.id = res.publicacion_id and res.comprador_id = yo and res.estado = 'activa' and res.orden_id is null and pu.usuario_id = v;
  end loop;
  return jsonb_build_object('ok', true, 'pago_id', v_pago, 'monto', round(total, 2), 'expira', now() + make_interval(mins => minutos), 'ordenes', array_length(vendedores, 1),
                            'yape_numero', aj->>'yape_numero', 'yape_nombre', aj->>'yape_nombre');
end;
$$;
grant execute on function public.crear_pago(uuid) to authenticated;

-- Libera las reservas de un pago (cancelado, vencido o rechazado) y devuelve el stock
create or replace function public.liberar_reservas_de_pago(p_pago uuid, p_estado_reserva text default 'liberada')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select res.id, res.publicacion_id from public.reservas res join public.ordenes o on o.id = res.orden_id where o.pago_id = p_pago and res.estado = 'activa' loop
    update public.reservas set estado = p_estado_reserva where id = r.id;
    perform public.recalcular_reservadas(r.publicacion_id);
  end loop;
end;
$$;
revoke all on function public.liberar_reservas_de_pago(uuid, text) from public, anon, authenticated;

-- El comprador cancela antes de enviar el comprobante
create or replace function public.cancelar_pago(p_pago uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  pg record;
begin
  select * into pg from public.pagos where id = p_pago and comprador_id = yo for update;
  if pg is null then return jsonb_build_object('ok', false, 'error', 'La compra no existe'); end if;
  if pg.estado <> 'pendiente' then return jsonb_build_object('ok', false, 'error', 'Esta compra ya no se puede cancelar'); end if;
  update public.pagos set estado = 'cancelado', motivo = 'Cancelada por el comprador', actualizado = now() where id = pg.id;
  update public.ordenes set estado = 'cancelada', motivo = 'Cancelada por el comprador', actualizada = now() where pago_id = pg.id;
  perform public.liberar_reservas_de_pago(pg.id, 'liberada');
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.cancelar_pago(uuid) to authenticated;

-- El comprador sube el voucher de Yape y el número de operación → pago en revisión (avisa al administrador)
create or replace function public.subir_comprobante(p_pago uuid, p_url text, p_operacion text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  pg record;
  op text := regexp_replace(coalesce(p_operacion, ''), '\s', '', 'g');
  dup int;
  comprador text;
begin
  select * into pg from public.pagos where id = p_pago and comprador_id = yo for update;
  if pg is null then return jsonb_build_object('ok', false, 'error', 'La compra no existe'); end if;
  if pg.estado = 'revision' then return jsonb_build_object('ok', true, 'estado', 'revision'); end if;
  if pg.estado <> 'pendiente' then return jsonb_build_object('ok', false, 'error', 'Esta compra ya no acepta comprobantes (' || pg.estado || ')'); end if;
  if pg.expira < now() then
    update public.pagos set estado = 'vencido', motivo = 'No se envió el comprobante a tiempo', actualizado = now() where id = pg.id;
    update public.ordenes set estado = 'cancelada', motivo = 'No se envió el comprobante a tiempo', actualizada = now() where pago_id = pg.id;
    perform public.liberar_reservas_de_pago(pg.id, 'vencida');
    return jsonb_build_object('ok', false, 'error', 'La reserva venció: vuelve a armar tu carrito');
  end if;
  if coalesce(p_url, '') = '' then return jsonb_build_object('ok', false, 'error', 'Falta la foto del comprobante'); end if;
  if length(op) < 4 then return jsonb_build_object('ok', false, 'error', 'Escribe el número de operación de Yape (está en el comprobante)'); end if;
  select count(*) into dup from public.pagos where n_operacion = op and id <> pg.id and estado in ('revision', 'confirmado');
  update public.pagos set estado = 'revision', voucher_url = p_url, n_operacion = op, comprobante_en = now(), actualizado = now(), expira = now() + interval '3 days' where id = pg.id;
  update public.ordenes set estado = 'revision', actualizada = now() where pago_id = pg.id;
  update public.reservas res set expira = now() + interval '3 days' from public.ordenes o where o.id = res.orden_id and o.pago_id = pg.id and res.estado = 'activa';
  select username into comprador from public.perfiles where id = yo;
  perform public.notificar_admins('pago_revision', 'Pago por confirmar: S/ ' || to_char(pg.monto, 'FM999990.00') || ' de @' || comprador,
    'Compra #' || pg.numero || ' · operación ' || op || case when dup > 0 then ' · ⚠️ este número de operación ya se usó en otra compra' else '' end,
    '/admin?tab=pagos', jsonb_build_object('pago_id', pg.id, 'monto', pg.monto, 'n_operacion', op, 'duplicado', dup > 0, 'comprador', comprador));
  perform public.notificar(yo, 'comprobante_recibido', 'Recibimos tu comprobante', 'Revisaremos tu pago de S/ ' || to_char(pg.monto, 'FM999990.00') || ' (operación ' || op || '). Te avisaremos apenas se confirme.', '/app/compras/' || pg.id, jsonb_build_object('pago_id', pg.id), '{app}');
  return jsonb_build_object('ok', true, 'estado', 'revision', 'duplicado', dup > 0);
end;
$$;
grant execute on function public.subir_comprobante(uuid, text, text) to authenticated;

-- Código de retiro de 6 dígitos
create or replace function public.codigo_retiro()
returns text
language sql
volatile
as $$
  select lpad((floor(random() * 1000000))::int::text, 6, '0');
$$;

-- Ubicación de una entrada (caja o álbum) para avisar al vendedor
create or replace function public.ubicacion_entrada_texto(p_entrada uuid)
returns text
language sql
stable
as $$
  select case when e.caja_id is not null then 'Caja "' || c.nombre || '"' else 'Sin caja' end
    from public.entradas e left join public.cajas c on c.id = e.caja_id where e.id = p_entrada;
$$;

-- El administrador confirma o rechaza un pago
create or replace function public.revisar_pago(p_pago uuid, p_accion text, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  pg record;
  o record;
  it record;
  t record;
  cartas text;
  tienda_txt text;
  limite date;
begin
  if yo is not null and not public.es_admin() then return jsonb_build_object('ok', false, 'error', 'Solo el administrador puede revisar pagos'); end if;
  select * into pg from public.pagos where id = p_pago for update;
  if pg is null then return jsonb_build_object('ok', false, 'error', 'El pago no existe'); end if;
  if pg.estado <> 'revision' then return jsonb_build_object('ok', false, 'error', 'El pago no está en revisión (' || pg.estado || ')'); end if;
  select * into t from public.tiendas where id = pg.tienda_id;
  tienda_txt := coalesce(t.nombre || case when t.distrito <> '' then ' (' || t.distrito || ')' else '' end, 'la tienda');
  if p_accion = 'rechazar' then
    update public.pagos set estado = 'rechazado', motivo = coalesce(nullif(p_motivo, ''), 'Pago rechazado'), revisado_en = now(), revisado_por = yo, actualizado = now() where id = pg.id;
    update public.ordenes set estado = 'pago_rechazado', motivo = coalesce(nullif(p_motivo, ''), 'Pago rechazado'), actualizada = now() where pago_id = pg.id;
    perform public.liberar_reservas_de_pago(pg.id, 'liberada');
    perform public.notificar(pg.comprador_id, 'pago_rechazado', 'Tu pago no fue aceptado', 'Compra #' || pg.numero || ': ' || coalesce(nullif(p_motivo, ''), 'no pudimos validar el comprobante') || '. Las cartas volvieron al mercado; si fue un error, vuelve a comprar y sube el comprobante correcto.', '/app/compras/' || pg.id, jsonb_build_object('pago_id', pg.id), '{app,correo}');
    return jsonb_build_object('ok', true, 'estado', 'rechazado');
  end if;
  if p_accion <> 'confirmar' then return jsonb_build_object('ok', false, 'error', 'Acción inválida'); end if;
  limite := public.fecha_limite_entrega(now());
  update public.pagos set estado = 'confirmado', revisado_en = now(), revisado_por = yo, actualizado = now() where id = pg.id;
  perform set_config('poketcg.interno', '1', true);
  for o in select * from public.ordenes where pago_id = pg.id loop
    update public.ordenes set estado = 'pago_confirmado', pago_confirmado_en = now(), fecha_limite = limite, codigo_retiro = public.codigo_retiro(), actualizada = now() where id = o.id;
    cartas := '';
    for it in select * from public.orden_items where orden_id = o.id loop
      -- la copia queda vendida (ya no se puede reservar) hasta que se entregue
      update public.publicaciones set reservadas = greatest(0, reservadas - it.cantidad), vendidas = vendidas + it.cantidad where id = it.publicacion_id;
      update public.reservas set estado = 'comprada' where id = it.reserva_id;
      cartas := cartas || case when cartas <> '' then '; ' else '' end || it.cantidad || '× ' || coalesce(public.nombre_carta_texto(it.carta_id), it.carta_id)
        || case when it.idioma <> '' then ' ' || it.idioma else '' end || case when it.acabado <> '' then ' ' || it.acabado else '' end
        || case when it.entrada_id is not null then ' → ' || coalesce(public.ubicacion_entrada_texto(it.entrada_id), '') else '' end;
    end loop;
    perform public.notificar(o.vendedor_id, 'venta_confirmada', '¡Vendiste! Orden #' || o.numero || ' por S/ ' || to_char(o.subtotal, 'FM999990.00'),
      'Entrega en ' || tienda_txt || ' hasta el ' || to_char(limite, 'DD/MM/YYYY') || '. Cartas: ' || cartas || '. Recibirás S/ ' || to_char(o.neto_vendedor, 'FM999990.00') || ' (precio − comisión). Elige la fecha de entrega en Mis ventas → Órdenes.',
      '/app/ventas/ordenes/' || o.id, jsonb_build_object('orden_id', o.id, 'wa', true), '{app,correo,whatsapp}');
    if t.id is not null then
      perform public.notificar(p.id, 'orden_por_llegar', 'Orden #' || o.numero || ' llegará a tu sede', 'El vendedor @' || (select username from public.perfiles where id = o.vendedor_id) || ' debe dejar ' || cartas || ' hasta el ' || to_char(limite, 'DD/MM/YYYY') || '.', '/tienda', jsonb_build_object('orden_id', o.id), '{app}')
        from public.perfiles p where p.rol = 'tienda' and p.tienda_id = t.id;
    end if;
  end loop;
  perform public.notificar(pg.comprador_id, 'pago_confirmado', 'Pago confirmado: compra #' || pg.numero,
    'Tus cartas llegarán a ' || tienda_txt || ' a más tardar el ' || to_char(limite, 'DD/MM/YYYY') || '. Te avisaremos cuando estén en la tienda con tu código de retiro.',
    '/app/compras/' || pg.id, jsonb_build_object('pago_id', pg.id), '{app,correo}');
  return jsonb_build_object('ok', true, 'estado', 'confirmado', 'fecha_limite', limite);
end;
$$;
revoke all on function public.revisar_pago(uuid, text, text) from public, anon;
grant execute on function public.revisar_pago(uuid, text, text) to authenticated;   -- la propia función exige es_admin()

-- Vence las compras sin comprobante (cada 10 minutos desde el servidor)
create or replace function public.vencer_pagos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pg record;
  n int := 0;
begin
  for pg in select * from public.pagos where estado = 'pendiente' and expira < now() for update skip locked loop
    update public.pagos set estado = 'vencido', motivo = 'No se envió el comprobante a tiempo', actualizado = now() where id = pg.id;
    update public.ordenes set estado = 'cancelada', motivo = 'No se envió el comprobante a tiempo', actualizada = now() where pago_id = pg.id;
    perform public.liberar_reservas_de_pago(pg.id, 'vencida');
    perform public.notificar(pg.comprador_id, 'pago_vencido', 'Tu reserva venció', 'La compra #' || pg.numero || ' se canceló porque no llegó el comprobante a tiempo. Las cartas volvieron al mercado.', '/app/compras/' || pg.id, jsonb_build_object('pago_id', pg.id), '{app}');
    n := n + 1;
  end loop;
  return jsonb_build_object('vencidos', n);
end;
$$;
revoke all on function public.vencer_pagos() from public, anon, authenticated;

-- Mi carrito: solo reservas que aún no son parte de una compra
create or replace function public.mi_carrito()
returns table (
  id uuid, publicacion_id uuid, cantidad int, precio_pen numeric, creada timestamptz, expira timestamptz,
  carta_id text, acabado text, idioma text, condicion text, fotos text[], vendedor text, vendedor_id uuid,
  estado_publicacion text, precio_actual numeric, disponibles int)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.publicacion_id, r.cantidad, r.precio_pen, r.creada, r.expira,
         p.carta_id, p.acabado, p.idioma, p.condicion, p.fotos, u.username, p.usuario_id, p.estado, p.precio_pen,
         p.cantidad - p.reservadas - p.vendidas + r.cantidad
    from public.reservas r
    join public.publicaciones p on p.id = r.publicacion_id
    join public.perfiles u on u.id = p.usuario_id
   where r.comprador_id = auth.uid() and r.estado = 'activa' and r.orden_id is null and r.expira > now()
   order by r.creada;
$$;

-- Mantenimiento (tarea diaria): reservas vencidas (solo las que no son parte de una compra) y avisos viejos
create or replace function public.mantenimiento_mercado()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  vencidas int;
  afectadas uuid[];
  a uuid;
begin
  with v as (
    update public.reservas set estado = 'vencida' where estado = 'activa' and orden_id is null and expira < now() returning publicacion_id
  ) select count(*), array_agg(distinct publicacion_id) into vencidas, afectadas from v;
  if afectadas is not null then
    foreach a in array afectadas loop perform public.recalcular_reservadas(a); end loop;
  end if;
  delete from public.mercado_eventos where creado < now() - interval '1 day';
  return jsonb_build_object('reservas_vencidas', coalesce(vencidas, 0));
end;
$$;
revoke all on function public.mantenimiento_mercado() from public, anon, authenticated;

-- Al pausar o retirar, se liberan solo las reservas del carrito (las compras en curso no se tocan)
create or replace function public.liberar_reservas_al_retirar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado in ('pausada', 'retirada', 'vendida') and old.estado in ('activa', 'reservada') then
    update public.reservas set estado = 'liberada' where publicacion_id = new.id and estado = 'activa' and orden_id is null;
  end if;
  return null;
end;
$$;

-- Comprobantes de pago: bucket privado (solo el comprador que lo subió y el administrador)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "comprobantes: ver" on storage.objects;
create policy "comprobantes: ver" on storage.objects for select using (bucket_id = 'comprobantes' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
drop policy if exists "comprobantes: subir propios" on storage.objects;
create policy "comprobantes: subir propios" on storage.objects for insert with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "comprobantes: reemplazar propios" on storage.objects;
create policy "comprobantes: reemplazar propios" on storage.objects for update using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Tiempo real
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.notificaciones; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.pagos; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.ordenes; exception when duplicate_object then null; end;
  end if;
end $$;
