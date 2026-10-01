-- ============================================================================
-- PokéTCG · Fase 4 · migración 0004 (reputación, reclamos y saldo, reportes, portada pública)
-- Pegar completo en Supabase → SQL Editor → Run. Idempotente: se puede ejecutar varias veces
-- (también después de cada bloque de la Fase 4) sin borrar datos.
-- Requiere 0001_fase1.sql, 0002_fase2.sql y 0003_fase3.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Reputación: reseñas del comprador, insignias automáticas, perfil público, suspensión de cuentas
--    y escala estándar de estado de las cartas (NM / LP / MP / HP / DM)
-- ----------------------------------------------------------------------------
alter table public.perfiles add column if not exists estado text not null default 'activo';
alter table public.perfiles drop constraint if exists perfiles_estado_check;
alter table public.perfiles add constraint perfiles_estado_check check (estado in ('activo', 'suspendido'));
alter table public.perfiles add column if not exists suspendido_motivo text;
alter table public.perfiles add column if not exists suspendido_en timestamptz;
alter table public.perfiles add column if not exists reputacion jsonb not null default '{}'::jsonb;   -- caché calculada (ventas, puntaje, insignias…)
alter table public.ordenes add column if not exists fecha_elegida_en timestamptz;                       -- cuándo eligió el vendedor la fecha de entrega

-- El usuario no puede tocar su estado ni su reputación
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
    new.estado := old.estado;
    new.suspendido_motivo := old.suspendido_motivo;
    new.suspendido_en := old.suspendido_en;
    new.reputacion := old.reputacion;
    -- si cambia el celular, hay que verificarlo otra vez
    if new.telefono is distinct from old.telefono then new.celular_verificado_en := null; end if;
  end if;
  new.username := lower(new.username);
  new.actualizado_en := now();
  return new;
end;
$$;

-- Escala estándar de estado de conservación (los valores antiguos se convierten una sola vez)
update public.entradas set condicion = case condicion when 'Perfecta (mint)' then 'NM' when 'Casi perfecta' then 'LP' when 'Buena' then 'MP' when 'Jugada' then 'HP' when 'Dañada' then 'DM' else condicion end
 where condicion in ('Perfecta (mint)', 'Casi perfecta', 'Buena', 'Jugada', 'Dañada');
update public.publicaciones set condicion = case condicion when 'Perfecta (mint)' then 'NM' when 'Casi perfecta' then 'LP' when 'Buena' then 'MP' when 'Jugada' then 'HP' when 'Dañada' then 'DM' else condicion end
 where condicion in ('Perfecta (mint)', 'Casi perfecta', 'Buena', 'Jugada', 'Dañada');
update public.orden_items set condicion = case condicion when 'Perfecta (mint)' then 'NM' when 'Casi perfecta' then 'LP' when 'Buena' then 'MP' when 'Jugada' then 'HP' when 'Dañada' then 'DM' else condicion end
 where condicion in ('Perfecta (mint)', 'Casi perfecta', 'Buena', 'Jugada', 'Dañada');

-- Reseñas: una por orden entregada, del comprador al vendedor
create table if not exists public.resenas (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null unique references public.ordenes (id) on delete cascade,
  comprador_id  uuid not null references public.perfiles (id) on delete cascade,
  vendedor_id   uuid not null references public.perfiles (id) on delete cascade,
  puntaje       int not null check (puntaje between 1 and 5),
  comentario    text not null default '' check (char_length(comentario) <= 500),
  respuesta     text check (char_length(respuesta) <= 300),
  respondida_en timestamptz,
  creada        timestamptz not null default now(),
  actualizada   timestamptz not null default now()
);
create index if not exists resenas_por_vendedor on public.resenas (vendedor_id, creada desc);
alter table public.resenas enable row level security;
drop policy if exists "resenas: ver" on public.resenas;
create policy "resenas: ver" on public.resenas for select using (true);
-- (sin escritura directa: calificar_orden / responder_resena)

-- Vista pública de vendedores (nombre de usuario, reputación y estado; nunca datos personales)
create or replace view public.vendedores_publicos as
  select id, username, reputacion, estado, creado_en from public.perfiles;
grant select on public.vendedores_publicos to authenticated, anon;
grant select on public.resenas to authenticated, anon;

-- Vista pública de reseñas con el nombre de usuario del comprador
create or replace view public.resenas_publicas as
  select r.id, r.orden_id, r.vendedor_id, r.puntaje, r.comentario, r.respuesta, r.respondida_en, r.creada,
         c.username as comprador, (select numero from public.ordenes o where o.id = r.orden_id) as orden_numero
    from public.resenas r join public.perfiles c on c.id = r.comprador_id;
grant select on public.resenas_publicas to authenticated, anon;

-- ¿Cuenta suspendida?
create or replace function public.es_suspendido(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = p_usuario and estado = 'suspendido');
$$;

-- Recalcula la reputación cacheada de un usuario (como vendedor)
create or replace function public.actualizar_reputacion(p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventas int; v_resenas int; v_puntaje numeric; v_faltas_90 int; v_faltas int;
  v_confirma_h numeric; v_cumple numeric; v_con_fecha int;
  v_insignias text[] := '{}';
  v_alerta text := null;
  rep jsonb;
begin
  if p_usuario is null then return '{}'::jsonb; end if;
  select count(*) into v_ventas from public.ordenes o where o.vendedor_id = p_usuario and o.estado in ('entregada', 'saldo_liberado');
  select count(*), round(avg(r.puntaje)::numeric, 2) into v_resenas, v_puntaje from public.resenas r where r.vendedor_id = p_usuario;
  select count(*) into v_faltas_90 from public.ordenes o where o.vendedor_id = p_usuario and o.estado = 'vencida' and o.actualizada > now() - interval '90 days';
  select count(*) into v_faltas from public.ordenes o where o.vendedor_id = p_usuario and o.estado = 'vencida';
  select round(avg(extract(epoch from (u.fecha_elegida_en - u.pago_confirmado_en)) / 3600)::numeric, 1) into v_confirma_h
    from (select o.fecha_elegida_en, o.pago_confirmado_en from public.ordenes o
           where o.vendedor_id = p_usuario and o.fecha_elegida_en is not null and o.pago_confirmado_en is not null
           order by o.pago_confirmado_en desc limit 20) u;
  select count(*), count(*) filter (where (u.en_tienda_en at time zone 'America/Lima')::date <= coalesce(u.fecha_entrega, u.fecha_limite))
    into v_con_fecha, v_cumple
    from (select o.en_tienda_en, o.fecha_entrega, o.fecha_limite from public.ordenes o
           where o.vendedor_id = p_usuario and o.en_tienda_en is not null and o.en_tienda_en > now() - interval '90 days'
           order by o.en_tienda_en desc limit 50) u;
  if v_ventas < 3 then v_insignias := array_append(v_insignias, 'nuevo'); end if;
  if v_ventas >= 3 and v_confirma_h is not null and v_confirma_h <= 24 then v_insignias := array_append(v_insignias, 'rapido'); end if;
  if v_ventas >= 3 and v_con_fecha > 0 and v_cumple::numeric / v_con_fecha >= 0.95 then v_insignias := array_append(v_insignias, 'cumple'); end if;
  if v_ventas >= 5 and v_faltas_90 = 0 then v_insignias := array_append(v_insignias, 'sin_faltas'); end if;
  if v_ventas >= 50 and coalesce(v_puntaje, 0) >= 4.7 then v_insignias := array_append(v_insignias, 'top'); end if;
  if v_faltas_90 >= 2 then v_alerta := 'faltas'; end if;
  rep := jsonb_build_object(
    'ventas', v_ventas, 'resenas', v_resenas, 'puntaje', v_puntaje,
    'faltas_90', v_faltas_90, 'faltas', v_faltas,
    'confirma_horas', v_confirma_h, 'cumple_pct', case when v_con_fecha > 0 then round(100.0 * v_cumple / v_con_fecha) else null end,
    'insignias', to_jsonb(v_insignias), 'alerta', v_alerta, 'actualizada', now());
  update public.perfiles set reputacion = rep where id = p_usuario;
  return rep;
end;
$$;
revoke all on function public.actualizar_reputacion(uuid) from public, anon, authenticated;

-- Cambios de orden que afectan la reputación del vendedor (y la fecha en que eligió la entrega)
create or replace function public.ordenes_reputacion_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.estado is distinct from old.estado or new.fecha_elegida_en is distinct from old.fecha_elegida_en) then
    perform public.actualizar_reputacion(new.vendedor_id);
  end if;
  return null;
end;
$$;
drop trigger if exists ordenes_reputacion on public.ordenes;
create trigger ordenes_reputacion after update on public.ordenes for each row execute function public.ordenes_reputacion_trigger();

create or replace function public.ordenes_fecha_elegida_trigger()
returns trigger
language plpgsql
as $$
begin
  if new.fecha_entrega is not null and new.fecha_entrega is distinct from old.fecha_entrega and new.fecha_elegida_en is null then new.fecha_elegida_en := now(); end if;
  return new;
end;
$$;
drop trigger if exists ordenes_fecha_elegida on public.ordenes;
create trigger ordenes_fecha_elegida before update of fecha_entrega on public.ordenes for each row execute function public.ordenes_fecha_elegida_trigger();

-- El comprador califica al vendedor (1 a 5 estrellas y comentario) una vez entregada la orden; puede corregir durante 7 días
create or replace function public.calificar_orden(p_orden uuid, p_puntaje int, p_comentario text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  o record;
  r record;
  texto text := left(coalesce(p_comentario, ''), 500);
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  if p_puntaje is null or p_puntaje < 1 or p_puntaje > 5 then return jsonb_build_object('ok', false, 'error', 'El puntaje va de 1 a 5'); end if;
  select * into o from public.ordenes where id = p_orden;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'La orden no existe'); end if;
  if o.comprador_id <> yo then return jsonb_build_object('ok', false, 'error', 'Solo el comprador puede calificar'); end if;
  if o.estado not in ('entregada', 'saldo_liberado') then return jsonb_build_object('ok', false, 'error', 'Solo se califican órdenes entregadas'); end if;
  if o.entregada_en < now() - interval '60 days' then return jsonb_build_object('ok', false, 'error', 'Ya pasó el plazo para calificar (60 días)'); end if;
  select * into r from public.resenas where orden_id = o.id;
  if r.id is not null then
    if r.creada < now() - interval '7 days' then return jsonb_build_object('ok', false, 'error', 'La calificación ya no se puede cambiar'); end if;
    update public.resenas set puntaje = p_puntaje, comentario = texto, actualizada = now() where id = r.id;
  else
    insert into public.resenas (orden_id, comprador_id, vendedor_id, puntaje, comentario) values (o.id, yo, o.vendedor_id, p_puntaje, texto);
    perform public.notificar(o.vendedor_id, 'resena', 'Nueva calificación: ' || repeat('★', p_puntaje) || ' (orden #' || o.numero || ')',
      case when texto <> '' then '"' || left(texto, 140) || '"' else 'El comprador te calificó con ' || p_puntaje || ' de 5.' end, '/app/ventas', jsonb_build_object('orden_id', o.id), '{app}');
  end if;
  perform public.actualizar_reputacion(o.vendedor_id);
  return jsonb_build_object('ok', true, 'puntaje', p_puntaje);
end;
$$;
grant execute on function public.calificar_orden(uuid, int, text) to authenticated;

-- El vendedor responde una reseña (una vez)
create or replace function public.responder_resena(p_resena uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  r record;
begin
  select * into r from public.resenas where id = p_resena;
  if r.id is null or r.vendedor_id <> yo then return jsonb_build_object('ok', false, 'error', 'No puedes responder esta reseña'); end if;
  if coalesce(trim(p_texto), '') = '' then return jsonb_build_object('ok', false, 'error', 'Escribe una respuesta'); end if;
  update public.resenas set respuesta = left(trim(p_texto), 300), respondida_en = now(), actualizada = now() where id = r.id;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.responder_resena(uuid, text) to authenticated;

-- Suspensión de cuentas (administrador): no puede comprar, reservar ni publicar; sus publicaciones quedan pausadas
create or replace function public.suspender_usuario(p_usuario uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  n int;
begin
  if yo is not null and not public.es_admin() then return jsonb_build_object('ok', false, 'error', 'Solo el administrador'); end if;
  if (select rol from public.perfiles where id = p_usuario) = 'admin' then return jsonb_build_object('ok', false, 'error', 'No se puede suspender a un administrador'); end if;
  update public.perfiles set estado = 'suspendido', suspendido_motivo = nullif(trim(coalesce(p_motivo, '')), ''), suspendido_en = now() where id = p_usuario;
  perform set_config('poketcg.interno', '1', true);
  update public.publicaciones set estado = 'pausada', motivo_pausa = 'suspension', aviso = 'Publicación pausada: cuenta suspendida.', actualizada = now()
   where usuario_id = p_usuario and estado in ('activa', 'reservada');
  get diagnostics n = row_count;
  update public.reservas set estado = 'liberada' where comprador_id = p_usuario and estado = 'activa' and orden_id is null;   -- su carrito se vacía
  perform public.notificar(p_usuario, 'cuenta_suspendida', 'Tu cuenta fue suspendida', 'No puedes comprar ni vender por ahora' || case when nullif(trim(coalesce(p_motivo, '')), '') is not null then ': ' || trim(p_motivo) else '' end || '. Si crees que es un error, escríbenos.', '/app/ajustes', '{}'::jsonb, '{app,correo}');
  return jsonb_build_object('ok', true, 'publicaciones_pausadas', n);
end;
$$;
grant execute on function public.suspender_usuario(uuid, text) to authenticated;   -- exige es_admin()

create or replace function public.reactivar_usuario(p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  n int;
begin
  if yo is not null and not public.es_admin() then return jsonb_build_object('ok', false, 'error', 'Solo el administrador'); end if;
  update public.perfiles set estado = 'activo', suspendido_motivo = null, suspendido_en = null where id = p_usuario;
  perform set_config('poketcg.interno', '1', true);
  update public.publicaciones set estado = 'activa', motivo_pausa = null, aviso = null, actualizada = now()
   where usuario_id = p_usuario and estado = 'pausada' and motivo_pausa = 'suspension';   -- el disparador vuelve a aplicar la regla de la foto
  get diagnostics n = row_count;
  perform public.notificar(p_usuario, 'cuenta_reactivada', 'Tu cuenta vuelve a estar activa', 'Ya puedes comprar y vender con normalidad. Tus publicaciones se reactivaron.', '/app/ventas', '{}'::jsonb, '{app,correo}');
  return jsonb_build_object('ok', true, 'publicaciones_reactivadas', n);
end;
$$;
grant execute on function public.reactivar_usuario(uuid) to authenticated;

-- Bloqueos para cuentas suspendidas (reservar, comprar, publicar)
create or replace function public.bloquear_suspendidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quien uuid;
begin
  quien := coalesce(to_jsonb(new)->>'comprador_id', to_jsonb(new)->>'usuario_id')::uuid;   -- (reservas/pagos: comprador; publicaciones: dueño)
  if tg_table_name = 'publicaciones' then
    -- las publicaciones de una cuenta suspendida nacen (o quedan) pausadas; la colección se sigue administrando con normalidad
    if new.estado = 'activa' and coalesce(current_setting('poketcg.interno', true), '') <> '1' and public.es_suspendido(quien) then
      new.estado := 'pausada'; new.motivo_pausa := 'suspension'; new.aviso := 'Publicación pausada: cuenta suspendida.';
    end if;
    return new;
  end if;
  if public.es_suspendido(quien) then
    raise exception 'Tu cuenta está suspendida: no puedes comprar ni vender por ahora.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists reservas_bloquear_suspendidos on public.reservas;
create trigger reservas_bloquear_suspendidos before insert on public.reservas for each row execute function public.bloquear_suspendidos();
drop trigger if exists pagos_bloquear_suspendidos on public.pagos;
create trigger pagos_bloquear_suspendidos before insert on public.pagos for each row execute function public.bloquear_suspendidos();
drop trigger if exists publicaciones_bloquear_suspendidos on public.publicaciones;
create trigger publicaciones_bloquear_suspendidos before insert or update of estado on public.publicaciones for each row execute function public.bloquear_suspendidos();



-- ----------------------------------------------------------------------------
-- B. Reclamos y devoluciones sin pasar por el administrador: plazos configurables, anulación por el
--    comprador, saldo del comprador (las devoluciones caen ahí y se usan en la siguiente compra o se
--    retiran), reclamos con fotos desde la orden y resolución en /admin
-- ----------------------------------------------------------------------------

-- Plazos: modo "sabado" (regla de la Fase 3) o "dias" (N días desde el pago); horas para elegir fecha
update public.ajustes_globales set valor = valor || jsonb_build_object('modo_limite', 'dias', 'entrega_dias', 7, 'plazo_fecha_horas', 48)
 where clave = 'pagos' and not (valor ? 'modo_limite');

create or replace function public.fecha_limite_entrega(p_confirmado timestamptz)
returns date
language sql
stable
as $$
  select case
    when coalesce(public.ajustes_pagos()->>'modo_limite', 'sabado') = 'dias'
      then (p_confirmado at time zone 'America/Lima')::date + greatest(1, coalesce((public.ajustes_pagos()->>'entrega_dias')::int, 7))
    when extract(dow from (p_confirmado at time zone 'America/Lima'))::int in (5, 6)
      then ((p_confirmado at time zone 'America/Lima')::date + (6 - extract(dow from (p_confirmado at time zone 'America/Lima'))::int) + 7)
    else ((p_confirmado at time zone 'America/Lima')::date + (6 - extract(dow from (p_confirmado at time zone 'America/Lima'))::int)) end;
$$;

-- Saldo del comprador: movimientos (devoluciones, uso en compras, retiros)
create table if not exists public.movimientos_saldo (
  id          bigserial primary key,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  tipo        text not null check (tipo in ('devolucion', 'uso_compra', 'retiro', 'ajuste')),
  monto       numeric(10,2) not null,              -- positivo entra, negativo sale
  orden_id    uuid references public.ordenes (id) on delete set null,
  pago_id     uuid references public.pagos (id) on delete set null,
  retiro_id   uuid references public.retiros (id) on delete set null,
  reclamo_id  uuid,
  detalle     text not null default '',
  creado      timestamptz not null default now()
);
create index if not exists movimientos_saldo_por_usuario on public.movimientos_saldo (usuario_id, creado desc);
alter table public.movimientos_saldo enable row level security;
drop policy if exists "movimientos_saldo: ver propios" on public.movimientos_saldo;
create policy "movimientos_saldo: ver propios" on public.movimientos_saldo for select using (usuario_id = auth.uid() or public.es_admin());
grant select on public.movimientos_saldo to authenticated;

alter table public.pagos add column if not exists monto_saldo numeric(10,2) not null default 0;   -- parte pagada con saldo
alter table public.pagos add column if not exists monto_yape numeric(10,2);                       -- parte que se paga por Yape/Plin
update public.pagos set monto_yape = monto where monto_yape is null;
alter table public.retiros add column if not exists origen text not null default 'ventas';     -- ventas | saldo (devoluciones del comprador)
alter table public.ordenes add column if not exists falta_vendedor boolean not null default false;   -- cuenta como falta en su reputación
alter table public.ordenes add column if not exists anulada_por text;                                -- comprador | automatica | reclamo

create or replace function public.saldo_de(p_usuario uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$ select coalesce(sum(monto), 0)::numeric(10,2) from public.movimientos_saldo where usuario_id = p_usuario; $$;
revoke all on function public.saldo_de(uuid) from public, anon, authenticated;

create or replace function public.acreditar_saldo(p_usuario uuid, p_monto numeric, p_tipo text, p_detalle text default '', p_orden uuid default null, p_pago uuid default null, p_reclamo uuid default null, p_retiro uuid default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_monto is null or p_monto = 0 then return public.saldo_de(p_usuario); end if;
  insert into public.movimientos_saldo (usuario_id, tipo, monto, detalle, orden_id, pago_id, reclamo_id, retiro_id) values (p_usuario, p_tipo, round(p_monto, 2), coalesce(p_detalle, ''), p_orden, p_pago, p_reclamo, p_retiro);
  return public.saldo_de(p_usuario);
end;
$$;
revoke all on function public.acreditar_saldo(uuid, numeric, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Mi saldo como comprador: disponible + últimos movimientos
create or replace function public.mi_saldo_comprador()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'saldo', public.saldo_de(auth.uid()),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'monto', m.monto, 'detalle', m.detalle, 'creado', m.creado, 'orden_id', m.orden_id, 'pago_id', m.pago_id) order by m.creado desc)
                             from (select * from public.movimientos_saldo where usuario_id = auth.uid() order by creado desc limit 50) m), '[]'::jsonb),
    'retiro_pendiente', (select coalesce(sum(monto), 0) from public.retiros where usuario_id = auth.uid() and origen = 'saldo' and estado in ('pendiente', 'sin_datos'))
  );
$$;
grant execute on function public.mi_saldo_comprador() to authenticated;

-- Retirar el saldo a Yape/Plin/banco: entra al Excel del siguiente día de pago (igual que las ventas)
create or replace function public.retirar_saldo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  s numeric := public.saldo_de(auth.uid());
  tiene_datos boolean;
  r record;
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  if s <= 0 then return jsonb_build_object('ok', false, 'error', 'No tienes saldo por retirar'); end if;
  select exists (select 1 from public.datos_cobro where usuario_id = yo) into tiene_datos;
  insert into public.retiros (usuario_id, monto, bruto, comision, ordenes, estado, origen) values (yo, s, s, 0, '{}', case when tiene_datos then 'pendiente' else 'sin_datos' end, 'saldo') returning * into r;
  perform public.acreditar_saldo(yo, -s, 'retiro', 'Retiro #' || r.numero || ' a tus datos de cobro', null, null, null, r.id);
  perform public.notificar(yo, 'retiro_solicitado', 'Retiro de S/ ' || to_char(s, 'FM999990.00') || ' en camino',
    case when tiene_datos then 'Se paga a tus datos de cobro en el siguiente día de pago.' else 'Para pagarte necesitamos tus datos de cobro (Yape, Plin o cuenta): regístralos en Ajustes.' end,
    '/app/compras', jsonb_build_object('retiro_id', r.id), case when tiene_datos then '{app}'::text[] else '{app,correo}'::text[] end);
  return jsonb_build_object('ok', true, 'retiro_id', r.id, 'monto', s, 'sin_datos', not tiene_datos);
end;
$$;
grant execute on function public.retirar_saldo() to authenticated;

-- Si un pago con saldo se vence, se cancela o se rechaza, el saldo usado vuelve
create or replace function public.pagos_devolver_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado in ('vencido', 'cancelado', 'rechazado') and old.estado not in ('vencido', 'cancelado', 'rechazado') and new.monto_saldo > 0 then
    perform public.acreditar_saldo(new.comprador_id, new.monto_saldo, 'devolucion', 'Compra #' || new.numero || ' ' || new.estado || ': vuelve el saldo que usaste', null, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists pagos_devolver_saldo on public.pagos;
create trigger pagos_devolver_saldo after update of estado on public.pagos for each row execute function public.pagos_devolver_saldo();

-- Las órdenes vencidas (o anuladas por el comprador / por reclamo) cuentan como falta del vendedor
create or replace function public.ordenes_marcar_falta()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'vencida' and old.estado is distinct from 'vencida' then new.falta_vendedor := true; end if;
  return new;
end;
$$;
drop trigger if exists ordenes_marcar_falta on public.ordenes;
create trigger ordenes_marcar_falta before update of estado on public.ordenes for each row execute function public.ordenes_marcar_falta();

-- Pago marcado: el aviso distingue ventas de devoluciones de saldo
create or replace function public.marcar_retiro_pagado(p_retiro uuid, p_operacion text default null, p_comprobante text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  r record;
begin
  if yo is not null and not public.es_admin() then return jsonb_build_object('ok', false, 'error', 'Solo el administrador'); end if;
  select * into r from public.retiros where id = p_retiro for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'El pago no existe'); end if;
  if r.estado = 'pagado' then return jsonb_build_object('ok', true, 'estado', 'pagado'); end if;
  update public.retiros set estado = 'pagado', pagado_en = now(), pagado_por = yo, n_operacion = nullif(p_operacion, ''), comprobante_url = nullif(p_comprobante, ''), actualizado = now() where id = r.id;
  perform public.notificar(r.usuario_id, 'retiro_pagado', 'Te pagamos S/ ' || to_char(r.monto, 'FM999990.00'),
    case when r.origen = 'saldo' then 'Devolución de tu saldo' else 'Depósito de tus ventas (' || array_length(r.ordenes, 1) || ' ' || case when array_length(r.ordenes, 1) = 1 then 'orden' else 'órdenes' end || ')' end
      || case when nullif(p_operacion, '') is not null then ' · operación ' || p_operacion else '' end
      || '. Revisa tu Yape/Plin o cuenta' || case when nullif(p_comprobante, '') is not null then '; el comprobante está en ' || case when r.origen = 'saldo' then 'Mis compras → Mi saldo' else 'Mis ventas → Mi saldo → movimientos' end || '.' else '.' end,
    case when r.origen = 'saldo' then '/app/compras' else '/app/ventas' end, jsonb_build_object('retiro_id', r.id, 'comprobante', nullif(p_comprobante, '') is not null), '{app,correo,whatsapp}');
  return jsonb_build_object('ok', true, 'estado', 'pagado');
end;
$$;
grant execute on function public.marcar_retiro_pagado(uuid, text, text) to authenticated;   -- la función exige es_admin()

-- Comprar usando el saldo: la parte cubierta se descuenta; si cubre todo, el pago se confirma al instante
create or replace function public.confirmar_pago_interno(p_pago uuid, p_revisor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pg record;
  o record;
  it record;
  t record;
  cartas text;
  tienda_txt text;
  limite date;
begin
  select * into pg from public.pagos where id = p_pago for update;
  if pg is null then return jsonb_build_object('ok', false, 'error', 'El pago no existe'); end if;
  if pg.estado not in ('revision', 'pendiente') then return jsonb_build_object('ok', false, 'error', 'El pago no está en revisión (' || pg.estado || ')'); end if;
  select * into t from public.tiendas where id = pg.tienda_id;
  tienda_txt := coalesce(t.nombre || case when t.distrito <> '' then ' (' || t.distrito || ')' else '' end, 'la tienda');
  limite := public.fecha_limite_entrega(now());
  update public.pagos set estado = 'confirmado', revisado_en = now(), revisado_por = p_revisor, actualizado = now() where id = pg.id;
  perform set_config('poketcg.interno', '1', true);
  for o in select * from public.ordenes where pago_id = pg.id loop
    update public.ordenes set estado = 'pago_confirmado', pago_confirmado_en = now(), fecha_limite = limite, codigo_retiro = public.codigo_retiro(), actualizada = now() where id = o.id;
    cartas := '';
    for it in select * from public.orden_items where orden_id = o.id loop
      update public.publicaciones set reservadas = greatest(0, reservadas - it.cantidad), vendidas = vendidas + it.cantidad where id = it.publicacion_id;
      update public.reservas set estado = 'comprada' where id = it.reserva_id;
      cartas := cartas || case when cartas <> '' then '; ' else '' end || it.cantidad || '× ' || coalesce(public.nombre_carta_texto(it.carta_id), it.carta_id)
        || case when it.idioma <> '' then ' ' || it.idioma else '' end || case when it.acabado <> '' then ' ' || it.acabado else '' end
        || case when it.entrada_id is not null then ' → ' || coalesce(public.ubicacion_entrada_texto(it.entrada_id), '') else '' end;
    end loop;
    -- las copias vendidas salen de la colección del vendedor (su ubicación queda guardada en la orden)
    perform public.descontar_entrega(o.id);
    perform public.notificar(o.vendedor_id, 'venta_confirmada', '¡Vendiste! Orden #' || o.numero || ' por S/ ' || to_char(o.subtotal, 'FM999990.00'),
      'Entrega en ' || tienda_txt || ' hasta el ' || to_char(limite, 'DD/MM/YYYY') || '. Cartas: ' || cartas || '. Ya salieron de tu colección. Recibirás S/ ' || to_char(o.neto_vendedor, 'FM999990.00') || ' (precio − comisión). Elige la fecha de entrega en Mis ventas → Órdenes.',
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
revoke all on function public.confirmar_pago_interno(uuid, uuid) from public, anon, authenticated;

create or replace function public.revisar_pago(p_pago uuid, p_accion text, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  pg record;
begin
  if yo is not null and not public.es_admin() then return jsonb_build_object('ok', false, 'error', 'Solo el administrador puede revisar pagos'); end if;
  select * into pg from public.pagos where id = p_pago for update;
  if pg is null then return jsonb_build_object('ok', false, 'error', 'El pago no existe'); end if;
  if pg.estado <> 'revision' then return jsonb_build_object('ok', false, 'error', 'El pago no está en revisión (' || pg.estado || ')'); end if;
  if p_accion = 'rechazar' then
    update public.pagos set estado = 'rechazado', motivo = coalesce(nullif(p_motivo, ''), 'Pago rechazado'), revisado_en = now(), revisado_por = yo, actualizado = now() where id = pg.id;
    update public.ordenes set estado = 'pago_rechazado', motivo = coalesce(nullif(p_motivo, ''), 'Pago rechazado'), actualizada = now() where pago_id = pg.id;
    perform public.liberar_reservas_de_pago(pg.id, 'liberada');
    perform public.notificar(pg.comprador_id, 'pago_rechazado', 'Tu pago no fue aceptado', 'Compra #' || pg.numero || ': ' || coalesce(nullif(p_motivo, ''), 'no pudimos validar el comprobante') || '. Las cartas volvieron al mercado' || case when pg.monto_saldo > 0 then ' y tu saldo usado volvió a tu cuenta' else '' end || '; si fue un error, vuelve a comprar y sube el comprobante correcto.', '/app/compras/' || pg.id, jsonb_build_object('pago_id', pg.id), '{app,correo}');
    return jsonb_build_object('ok', true, 'estado', 'rechazado');
  end if;
  if p_accion <> 'confirmar' then return jsonb_build_object('ok', false, 'error', 'Acción inválida'); end if;
  return public.confirmar_pago_interno(pg.id, yo);
end;
$$;

create or replace function public.crear_pago(p_tienda uuid, p_usar_saldo boolean default true)
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
  saldo numeric := 0;
  usado numeric := 0;
  conf jsonb;
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  if not exists (select 1 from public.tiendas where id = p_tienda and activa) then return jsonb_build_object('ok', false, 'error', 'Elige una tienda de entrega'); end if;
  if exists (select 1 from public.pagos where comprador_id = yo and estado = 'pendiente' and expira > now()) then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes una compra esperando el comprobante: termínala o cancélala en Mis compras');
  end if;
  for r in select res.* from public.reservas res where res.comprador_id = yo and res.estado = 'activa' and res.orden_id is null and res.expira > now() order by res.creada loop
    select * into p from public.publicaciones where id = r.publicacion_id for update;
    if p is null or p.estado not in ('activa', 'reservada') then return jsonb_build_object('ok', false, 'error', 'Una publicación de tu carrito ya no está disponible: quítala e inténtalo de nuevo'); end if;
    if p.usuario_id = yo then return jsonb_build_object('ok', false, 'error', 'No puedes comprar tus propias cartas'); end if;
    n_items := n_items + 1;
    total := total + r.cantidad * r.precio_pen;
    if not (p.usuario_id = any(vendedores)) then vendedores := vendedores || p.usuario_id; end if;
  end loop;
  if n_items = 0 then return jsonb_build_object('ok', false, 'error', 'Tu carrito está vacío'); end if;
  total := round(total, 2);
  if coalesce(p_usar_saldo, true) then saldo := public.saldo_de(yo); usado := least(greatest(saldo, 0), total); end if;
  insert into public.pagos (comprador_id, tienda_id, monto, monto_saldo, monto_yape, expira) values (yo, p_tienda, total, usado, total - usado, now() + make_interval(mins => minutos)) returning id into v_pago;
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
  if usado > 0 then
    perform public.acreditar_saldo(yo, -usado, 'uso_compra', 'Compra #' || (select numero from public.pagos where id = v_pago), null, v_pago);
  end if;
  if usado >= total then
    -- el saldo cubre todo: sin comprobante, confirmación inmediata
    update public.pagos set estado = 'revision', n_operacion = 'SALDO', comprobante_en = now(), actualizado = now() where id = v_pago;
    conf := public.confirmar_pago_interno(v_pago, null);
    return jsonb_build_object('ok', true, 'pago_id', v_pago, 'monto', total, 'monto_saldo', usado, 'monto_yape', 0, 'confirmado', (conf->>'ok')::boolean, 'ordenes', array_length(vendedores, 1));
  end if;
  return jsonb_build_object('ok', true, 'pago_id', v_pago, 'monto', total, 'monto_saldo', usado, 'monto_yape', total - usado, 'expira', now() + make_interval(mins => minutos), 'ordenes', array_length(vendedores, 1),
                            'yape_numero', aj->>'yape_numero', 'yape_nombre', aj->>'yape_nombre');
end;
$$;
grant execute on function public.crear_pago(uuid, boolean) to authenticated;
drop function if exists public.crear_pago(uuid);

-- Una orden confirmada que no se entregó: copias al vendedor, dinero al saldo del comprador, falta registrada
create or replace function public.vencer_orden(p_orden uuid, p_motivo text, p_por text default 'automatica')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  pg record;
  dev numeric;
begin
  select * into o from public.ordenes where id = p_orden for update;
  if o.id is null or o.estado <> 'pago_confirmado' then return jsonb_build_object('ok', false, 'error', 'La orden no está en camino'); end if;
  select * into pg from public.pagos where id = o.pago_id;
  update public.ordenes set estado = 'vencida', motivo = p_motivo, anulada_por = p_por, actualizada = now() where id = o.id;
  perform public.devolver_venta(o.id);
  dev := public.acreditar_saldo(o.comprador_id, o.subtotal, 'devolucion', 'Orden #' || o.numero || ' ' || case when p_por = 'comprador' then 'anulada' else 'vencida' end || ': devolución', o.id, o.pago_id);
  perform public.notificar_admins('orden_vencida', 'Orden #' || o.numero || ' ' || case when p_por = 'comprador' then 'anulada por el comprador' else 'vencida' end || ': S/ ' || to_char(o.subtotal, 'FM999990.00') || ' devueltos al saldo',
    'El vendedor @' || (select username from public.perfiles where id = o.vendedor_id) || ' no entregó a tiempo. El comprador @' || (select username from public.perfiles where id = o.comprador_id) || ' ya tiene el dinero en su saldo (lo usa en otra compra o lo retira).', '/admin?tab=ordenes', jsonb_build_object('orden_id', o.id));
  perform public.notificar(o.comprador_id, 'orden_vencida', 'Orden #' || o.numero || ': te devolvimos S/ ' || to_char(o.subtotal, 'FM999990.00'),
    'El vendedor no dejó las cartas en la tienda a tiempo. El dinero ya está en tu saldo de PokéTCG (S/ ' || to_char(dev, 'FM999990.00') || '): úsalo en tu siguiente compra o retíralo a tu Yape desde Mis compras.', '/app/compras', jsonb_build_object('orden_id', o.id), '{app,correo}');
  perform public.notificar(o.vendedor_id, 'orden_vencida_vendedor', 'Orden #' || o.numero || ' ' || case when p_por = 'comprador' then 'anulada por el comprador' else 'vencida' end,
    p_motivo || '. La venta se anuló, las cartas volvieron a tu colección y queda registrada la falta en tu reputación.', '/app/ventas/ordenes/' || o.id, jsonb_build_object('orden_id', o.id), '{app,correo}');
  return jsonb_build_object('ok', true, 'devuelto', o.subtotal);
end;
$$;
revoke all on function public.vencer_orden(uuid, text, text) from public, anon, authenticated;

-- El comprador anula solo cuando el vendedor no eligió fecha a tiempo o no entregó en la fecha prometida
create or replace function public.anular_orden_comprador(p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  o record;
  horas int := coalesce((public.ajustes_pagos()->>'plazo_fecha_horas')::int, 48);
  hoy date := (now() at time zone 'America/Lima')::date;
  motivo text;
begin
  select * into o from public.ordenes where id = p_orden;
  if o.id is null or o.comprador_id <> yo then return jsonb_build_object('ok', false, 'error', 'Solo el comprador puede anular su orden'); end if;
  if o.estado <> 'pago_confirmado' then return jsonb_build_object('ok', false, 'error', 'Esta orden ya no se puede anular (' || o.estado || ')'); end if;
  if o.fecha_entrega is null and o.pago_confirmado_en < now() - make_interval(hours => horas) then
    motivo := 'Anulada por el comprador: el vendedor no eligió fecha de entrega en ' || horas || ' horas';
  elsif o.fecha_entrega is not null and o.fecha_entrega < hoy then
    motivo := 'Anulada por el comprador: el vendedor no entregó en la fecha prometida (' || to_char(o.fecha_entrega, 'DD/MM/YYYY') || ')';
  elsif o.fecha_limite < hoy then
    motivo := 'Anulada por el comprador: pasó la fecha límite (' || to_char(o.fecha_limite, 'DD/MM/YYYY') || ')';
  else
    return jsonb_build_object('ok', false, 'error', 'Todavía no puedes anular: el vendedor tiene hasta ' || to_char(coalesce(o.fecha_entrega, o.fecha_limite), 'DD/MM/YYYY') || case when o.fecha_entrega is null then ' (o ' || horas || ' h para elegir fecha)' else '' end);
  end if;
  return public.vencer_orden(o.id, motivo, 'comprador');
end;
$$;
grant execute on function public.anular_orden_comprador(uuid) to authenticated;

-- Reclamos: el comprador (o la tienda por él) reclama antes de llevarse las cartas; el administrador resuelve
create table if not exists public.reclamos (
  id              uuid primary key default gen_random_uuid(),
  numero          bigserial,
  orden_id        uuid not null references public.ordenes (id) on delete cascade,
  comprador_id    uuid not null references public.perfiles (id) on delete cascade,
  vendedor_id     uuid not null references public.perfiles (id) on delete cascade,
  abierto_por     text not null check (abierto_por in ('comprador', 'tienda', 'admin')),
  abierto_por_id  uuid,
  motivo          text not null check (motivo in ('falta_carta', 'carta_distinta', 'estado', 'otro')),
  detalle         text not null default '' check (char_length(detalle) <= 1000),
  fotos           text[] not null default '{}',
  estado          text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  resolucion      text check (resolucion in ('devolver', 'entregar', 'parcial')),
  monto_devuelto  numeric(10,2),
  nota_admin      text,
  resuelto_en     timestamptz,
  resuelto_por    uuid,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);
create unique index if not exists reclamos_abierto_por_orden on public.reclamos (orden_id) where estado = 'abierto';
alter table public.reclamos enable row level security;
drop policy if exists "reclamos: ver" on public.reclamos;
create policy "reclamos: ver" on public.reclamos for select
  using (comprador_id = auth.uid() or vendedor_id = auth.uid() or public.es_admin()
         or exists (select 1 from public.ordenes o where o.id = orden_id and o.tienda_id is not null and o.tienda_id = public.mi_tienda()));
grant select on public.reclamos to authenticated;

create or replace function public.abrir_reclamo(p_orden uuid, p_motivo text, p_detalle text default '', p_fotos text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  o record;
  quien text;
  r record;
  etiqueta text;
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  if p_motivo not in ('falta_carta', 'carta_distinta', 'estado', 'otro') then return jsonb_build_object('ok', false, 'error', 'Motivo inválido'); end if;
  select * into o from public.ordenes where id = p_orden for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'La orden no existe'); end if;
  if yo = o.comprador_id then quien := 'comprador';
  elsif (select rol from public.perfiles where id = yo) = 'tienda' and (select tienda_id from public.perfiles where id = yo) = o.tienda_id then quien := 'tienda';
  elsif public.es_admin() then quien := 'admin';
  else return jsonb_build_object('ok', false, 'error', 'Solo el comprador o la tienda pueden reclamar'); end if;
  if o.estado <> 'en_tienda' then return jsonb_build_object('ok', false, 'error', 'Solo se puede reclamar mientras la orden está en la tienda, antes de llevarte las cartas'); end if;
  etiqueta := case p_motivo when 'falta_carta' then 'falta una carta' when 'carta_distinta' then 'carta distinta a la publicada' when 'estado' then 'estado distinto al publicado' else 'otro problema' end;
  insert into public.reclamos (orden_id, comprador_id, vendedor_id, abierto_por, abierto_por_id, motivo, detalle, fotos)
  values (o.id, o.comprador_id, o.vendedor_id, quien, yo, p_motivo, left(coalesce(p_detalle, ''), 1000), coalesce(p_fotos, '{}')) returning * into r;
  update public.ordenes set estado = 'disputa', motivo = 'Reclamo #' || r.numero || ': ' || etiqueta, actualizada = now() where id = o.id;
  perform public.notificar_admins('reclamo', 'Reclamo #' || r.numero || ' en la orden #' || o.numero || ': ' || etiqueta,
    'Abierto por ' || quien || '. ' || coalesce(nullif(left(p_detalle, 300), ''), '') || ' Resuélvelo en Admin → Reclamos (devolver, entregar o parcial).', '/admin?tab=reclamos', jsonb_build_object('reclamo_id', r.id, 'orden_id', o.id));
  perform public.notificar(o.vendedor_id, 'reclamo_vendedor', 'Reclamo en tu orden #' || o.numero || ': ' || etiqueta,
    'El comprador reportó un problema al revisar las cartas en la tienda' || case when coalesce(p_detalle, '') <> '' then ': «' || left(p_detalle, 300) || '»' else '' end || '. Las cartas quedan en la tienda y tu pago en espera hasta que el administrador lo resuelva.', '/app/ventas/ordenes/' || o.id, jsonb_build_object('reclamo_id', r.id, 'orden_id', o.id), '{app,correo}');
  perform public.notificar(o.comprador_id, 'reclamo_abierto', 'Recibimos tu reclamo #' || r.numero, 'Deja las cartas en la tienda. Lo revisamos y te avisamos; si procede, el dinero vuelve a tu saldo.', '/app/compras/' || o.pago_id, jsonb_build_object('reclamo_id', r.id, 'orden_id', o.id), '{app,correo}');
  return jsonb_build_object('ok', true, 'reclamo_id', r.id, 'numero', r.numero);
end;
$$;
grant execute on function public.abrir_reclamo(uuid, text, text, text[]) to authenticated;

create or replace function public.resolver_reclamo(p_reclamo uuid, p_resolucion text, p_monto numeric default null, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  r record;
  o record;
  dev numeric := 0;
  ent jsonb;
  vendedor text;
  comprador text;
begin
  if yo is not null and not public.es_admin() then return jsonb_build_object('ok', false, 'error', 'Solo el administrador'); end if;
  if p_resolucion not in ('devolver', 'entregar', 'parcial') then return jsonb_build_object('ok', false, 'error', 'Resolución inválida'); end if;
  select * into r from public.reclamos where id = p_reclamo for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'El reclamo no existe'); end if;
  if r.estado <> 'abierto' then return jsonb_build_object('ok', false, 'error', 'El reclamo ya está resuelto'); end if;
  select * into o from public.ordenes where id = r.orden_id for update;
  if o.estado <> 'disputa' then return jsonb_build_object('ok', false, 'error', 'La orden no está en disputa (' || o.estado || ')'); end if;
  select username into vendedor from public.perfiles where id = o.vendedor_id;
  select username into comprador from public.perfiles where id = o.comprador_id;
  if p_resolucion = 'devolver' then
    update public.ordenes set estado = 'cancelada', motivo = 'Reclamo #' || r.numero || ' resuelto: devolución al comprador', anulada_por = 'reclamo', falta_vendedor = true, actualizada = now() where id = o.id;
    perform public.devolver_venta(o.id);
    dev := o.subtotal;
    perform public.acreditar_saldo(o.comprador_id, dev, 'devolucion', 'Reclamo #' || r.numero || ' (orden #' || o.numero || '): devolución', o.id, o.pago_id, r.id);
    perform public.notificar(o.vendedor_id, 'reclamo_resuelto', 'Reclamo #' || r.numero || ': la orden #' || o.numero || ' se anuló', 'El administrador dio la razón al comprador' || case when coalesce(p_nota, '') <> '' then ': ' || p_nota else '' end || '. Las cartas volvieron a tu colección y están en la tienda: pasa a recogerlas. La falta queda en tu reputación.', '/app/ventas/ordenes/' || o.id, jsonb_build_object('reclamo_id', r.id), '{app,correo}');
    perform public.notificar(o.comprador_id, 'reclamo_resuelto', 'Reclamo #' || r.numero || ' resuelto: te devolvimos S/ ' || to_char(dev, 'FM999990.00'), 'El dinero ya está en tu saldo de PokéTCG: úsalo en otra compra o retíralo a tu Yape desde Mis compras.' || case when coalesce(p_nota, '') <> '' then ' Nota: ' || p_nota else '' end, '/app/compras', jsonb_build_object('reclamo_id', r.id), '{app,correo}');
    perform public.notificar(p.id, 'reclamo_tienda', 'Orden #' || o.numero || ': entregar las cartas al vendedor @' || coalesce(vendedor, '?'), 'El reclamo se resolvió a favor del comprador; el vendedor pasará a recoger su sobre.', '/app/tienda', jsonb_build_object('orden_id', o.id), '{app}')
      from public.perfiles p where p.rol = 'tienda' and p.tienda_id = o.tienda_id;
  else
    if p_resolucion = 'parcial' then
      if p_monto is null or p_monto <= 0 or p_monto >= o.subtotal then return jsonb_build_object('ok', false, 'error', 'El monto parcial debe ser mayor que 0 y menor que S/ ' || to_char(o.subtotal, 'FM999990.00')); end if;
      dev := round(p_monto, 2);
      update public.ordenes set neto_vendedor = greatest(0, neto_vendedor - dev), actualizada = now() where id = o.id;
      perform public.acreditar_saldo(o.comprador_id, dev, 'devolucion', 'Reclamo #' || r.numero || ' (orden #' || o.numero || '): devolución parcial', o.id, o.pago_id, r.id);
    end if;
    update public.ordenes set estado = 'en_tienda', motivo = null, actualizada = now() where id = o.id;
    ent := public.marcar_entregada(o.id, null, 'automatica');
    if coalesce((ent->>'ok')::boolean, false) = false then return jsonb_build_object('ok', false, 'error', coalesce(ent->>'error', 'No se pudo marcar la entrega')); end if;
    perform public.liberar_saldos();   -- con liberacion_dias = 0 la ganancia del vendedor queda lista al instante
    perform public.notificar(o.vendedor_id, 'reclamo_resuelto', 'Reclamo #' || r.numero || ' resuelto: la orden #' || o.numero || ' se entrega', case when dev > 0 then 'Se devolvió S/ ' || to_char(dev, 'FM999990.00') || ' al comprador y recibirás el resto' else 'El comprador se queda con las cartas y tu pago sigue su curso' end || case when coalesce(p_nota, '') <> '' then '. Nota: ' || p_nota else '.' end, '/app/ventas/ordenes/' || o.id, jsonb_build_object('reclamo_id', r.id), '{app,correo}');
    perform public.notificar(o.comprador_id, 'reclamo_resuelto', 'Reclamo #' || r.numero || ' resuelto' || case when dev > 0 then ': te devolvimos S/ ' || to_char(dev, 'FM999990.00') else '' end, case when dev > 0 then 'La devolución parcial ya está en tu saldo. ' else '' end || 'La orden queda entregada; las cartas ya están en tu colección (Cajas → Por colocar).' || case when coalesce(p_nota, '') <> '' then ' Nota: ' || p_nota else '' end, '/app/compras/' || o.pago_id, jsonb_build_object('reclamo_id', r.id), '{app,correo}');
  end if;
  update public.reclamos set estado = 'resuelto', resolucion = p_resolucion, monto_devuelto = nullif(dev, 0), nota_admin = nullif(p_nota, ''), resuelto_en = now(), resuelto_por = yo, actualizado = now() where id = r.id;
  return jsonb_build_object('ok', true, 'resolucion', p_resolucion, 'devuelto', dev);
end;
$$;
grant execute on function public.resolver_reclamo(uuid, text, numeric, text) to authenticated;   -- exige es_admin()

-- La reputación cuenta como falta las órdenes vencidas y las anuladas por reclamo o por el comprador
create or replace function public.actualizar_reputacion(p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventas int; v_resenas int; v_puntaje numeric; v_faltas_90 int; v_faltas int;
  v_confirma_h numeric; v_cumple numeric; v_con_fecha int;
  v_insignias text[] := '{}';
  v_alerta text := null;
  rep jsonb;
begin
  if p_usuario is null then return '{}'::jsonb; end if;
  select count(*) into v_ventas from public.ordenes o where o.vendedor_id = p_usuario and o.estado in ('entregada', 'saldo_liberado');
  select count(*), round(avg(r.puntaje)::numeric, 2) into v_resenas, v_puntaje from public.resenas r where r.vendedor_id = p_usuario;
  select count(*) into v_faltas_90 from public.ordenes o where o.vendedor_id = p_usuario and (o.estado = 'vencida' or o.falta_vendedor) and o.actualizada > now() - interval '90 days';
  select count(*) into v_faltas from public.ordenes o where o.vendedor_id = p_usuario and (o.estado = 'vencida' or o.falta_vendedor);
  select round(avg(extract(epoch from (u.fecha_elegida_en - u.pago_confirmado_en)) / 3600)::numeric, 1) into v_confirma_h
    from (select o.fecha_elegida_en, o.pago_confirmado_en from public.ordenes o
           where o.vendedor_id = p_usuario and o.fecha_elegida_en is not null and o.pago_confirmado_en is not null
           order by o.pago_confirmado_en desc limit 20) u;
  select count(*), count(*) filter (where (u.en_tienda_en at time zone 'America/Lima')::date <= coalesce(u.fecha_entrega, u.fecha_limite))
    into v_con_fecha, v_cumple
    from (select o.en_tienda_en, o.fecha_entrega, o.fecha_limite from public.ordenes o
           where o.vendedor_id = p_usuario and o.en_tienda_en is not null and o.en_tienda_en > now() - interval '90 days'
           order by o.en_tienda_en desc limit 50) u;
  if v_ventas < 3 then v_insignias := array_append(v_insignias, 'nuevo'); end if;
  if v_ventas >= 3 and v_confirma_h is not null and v_confirma_h <= 24 then v_insignias := array_append(v_insignias, 'rapido'); end if;
  if v_ventas >= 3 and v_con_fecha > 0 and v_cumple::numeric / v_con_fecha >= 0.95 then v_insignias := array_append(v_insignias, 'cumple'); end if;
  if v_ventas >= 5 and v_faltas_90 = 0 then v_insignias := array_append(v_insignias, 'sin_faltas'); end if;
  if v_ventas >= 50 and coalesce(v_puntaje, 0) >= 4.7 then v_insignias := array_append(v_insignias, 'top'); end if;
  if v_faltas_90 >= 2 then v_alerta := 'faltas'; end if;
  rep := jsonb_build_object(
    'ventas', v_ventas, 'resenas', v_resenas, 'puntaje', v_puntaje,
    'faltas_90', v_faltas_90, 'faltas', v_faltas,
    'confirma_horas', v_confirma_h, 'cumple_pct', case when v_con_fecha > 0 then round(100.0 * v_cumple / v_con_fecha) else null end,
    'insignias', to_jsonb(v_insignias), 'alerta', v_alerta, 'actualizada', now());
  update public.perfiles set reputacion = rep where id = p_usuario;
  return rep;
end;
$$;
revoke all on function public.actualizar_reputacion(uuid) from public, anon, authenticated;

-- Mantenimiento de órdenes (B): las vencidas devuelven las copias al vendedor y el dinero al saldo del comprador
create or replace function public.mantenimiento_ordenes(p_hora int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dias int := coalesce((public.ajustes_pagos()->>'confirmacion_dias')::int, 3);
  hoy date := (now() at time zone 'America/Lima')::date;
  hora int := coalesce(p_hora, extract(hour from now() at time zone 'America/Lima')::int);
  o record;
  fecha_ref date;
  auto int := 0; venc int := 0; rec int := 0; rec_v int := 0;
begin
  -- confirmación automática
  for o in select * from public.ordenes where estado = 'en_tienda' and en_tienda_en < now() - make_interval(days => dias) loop
    perform public.marcar_entregada(o.id, null, 'automatica');
    auto := auto + 1;
  end loop;
  -- recordatorios al comprador (día 1 y día 2 en tienda)
  for o in select * from public.ordenes where estado = 'en_tienda' and recordatorios < 2 and en_tienda_en < now() - make_interval(days => recordatorios + 1) loop
    perform public.notificar(o.comprador_id, 'recordatorio', 'Tu orden #' || o.numero || ' te espera en la tienda', 'Recógela con tu código ' || o.codigo_retiro || ' y marca «Entregado». Si no hay novedad en ' || dias || ' días, se confirma sola.', '/app/compras/' || o.pago_id, jsonb_build_object('orden_id', o.id), '{app,correo}');
    update public.ordenes set recordatorios = recordatorios + 1 where id = o.id;
    rec := rec + 1;
  end loop;
  -- recordatorios al vendedor: el día anterior y el día de la entrega (y de la fecha límite), una vez al día desde las 8:00
  if hora >= 8 then
    for o in select ord.*, t.nombre as tienda_nombre, t.direccion as tienda_direccion, t.horario as tienda_horario
               from public.ordenes ord left join public.tiendas t on t.id = ord.tienda_id
              where ord.estado = 'pago_confirmado' and (ord.recordatorio_vendedor is null or ord.recordatorio_vendedor < hoy)
                and hoy in (coalesce(ord.fecha_entrega, ord.fecha_limite) - 1, coalesce(ord.fecha_entrega, ord.fecha_limite), ord.fecha_limite - 1, ord.fecha_limite) loop
      fecha_ref := coalesce(o.fecha_entrega, o.fecha_limite);
      perform public.notificar(o.vendedor_id, 'recordatorio_vendedor',
        case when hoy < fecha_ref then 'Mañana entregas la orden #' || o.numero
             when hoy = fecha_ref then 'Hoy entregas la orden #' || o.numero
             else 'Orden #' || o.numero || ': la entrega está atrasada' end,
        'Deja las cartas en ' || coalesce(o.tienda_nombre, 'la tienda') || case when coalesce(o.tienda_direccion, '') <> '' then ' (' || o.tienda_direccion || ')' else '' end
          || case when coalesce(o.tienda_horario, '') <> '' then ' · ' || o.tienda_horario else '' end
          || '. Fecha límite: ' || to_char(o.fecha_limite, 'DD/MM/YYYY') || '. Si no llegan a tiempo, la orden se anula y queda registrada la falta.',
        '/app/ventas/ordenes/' || o.id, jsonb_build_object('orden_id', o.id), '{app,correo}');
      update public.ordenes set recordatorio_vendedor = hoy where id = o.id;
      rec_v := rec_v + 1;
    end loop;
  end if;
  -- vencidas: pasó la fecha límite sin dejar la carta en la tienda → copias al vendedor, dinero al saldo del comprador
  for o in select * from public.ordenes where estado = 'pago_confirmado' and fecha_limite < hoy loop
    perform public.vencer_orden(o.id, 'No se entregó en la tienda antes del ' || to_char(o.fecha_limite, 'DD/MM/YYYY'), 'automatica');
    venc := venc + 1;
  end loop;
  return jsonb_build_object('confirmadas_auto', auto, 'recordatorios', rec, 'recordatorios_vendedor', rec_v, 'vencidas', venc);
end;
$$;
revoke all on function public.mantenimiento_ordenes(int) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- C. Reportes del administrador: ventas y comisiones por día / semana / mes, top vendedores y cartas,
--    órdenes por estado, devoluciones y usuarios nuevos (exportable a Excel desde el servidor)
-- ----------------------------------------------------------------------------
create or replace function public.reporte_ventas(p_desde date, p_hasta date, p_grupo text default 'dia')
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  grupo text := case when p_grupo in ('dia', 'semana', 'mes') then p_grupo else 'dia' end;
  d1 timestamptz := (p_desde::text || ' 00:00')::timestamp at time zone 'America/Lima';
  d2 timestamptz := ((p_hasta + 1)::text || ' 00:00')::timestamp at time zone 'America/Lima';
  res jsonb;
begin
  if not public.es_admin() then raise exception 'Solo el administrador'; end if;
  with entregadas as (
    select o.*, (o.entregada_en at time zone 'America/Lima')::date as dia
      from public.ordenes o
     where o.estado in ('entregada', 'saldo_liberado') and o.entregada_en >= d1 and o.entregada_en < d2
  ), devueltas as (
    select o.*, (o.actualizada at time zone 'America/Lima')::date as dia
      from public.ordenes o
     where (o.estado = 'vencida' or (o.estado = 'cancelada' and o.anulada_por = 'reclamo')) and o.actualizada >= d1 and o.actualizada < d2
  ), periodos as (
    select case grupo when 'mes' then to_char(date_trunc('month', dia), 'YYYY-MM') when 'semana' then to_char(date_trunc('week', dia), 'YYYY-MM-DD') else to_char(dia, 'YYYY-MM-DD') end as periodo,
           count(*) as ordenes, sum(subtotal) as ventas, sum(comision) as comisiones, sum(neto_vendedor) as neto, count(distinct comprador_id) as compradores, count(distinct vendedor_id) as vendedores
      from entregadas group by 1
  ), devueltas_p as (
    select case grupo when 'mes' then to_char(date_trunc('month', dia), 'YYYY-MM') when 'semana' then to_char(date_trunc('week', dia), 'YYYY-MM-DD') else to_char(dia, 'YYYY-MM-DD') end as periodo,
           count(*) as devoluciones, sum(subtotal) as monto_devuelto
      from devueltas group by 1
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'grupo', grupo,
    'serie', coalesce((select jsonb_agg(jsonb_build_object('periodo', coalesce(p.periodo, d.periodo), 'ordenes', coalesce(p.ordenes, 0), 'ventas', coalesce(p.ventas, 0), 'comisiones', coalesce(p.comisiones, 0), 'neto', coalesce(p.neto, 0), 'compradores', coalesce(p.compradores, 0), 'vendedores', coalesce(p.vendedores, 0), 'devoluciones', coalesce(d.devoluciones, 0), 'monto_devuelto', coalesce(d.monto_devuelto, 0)) order by coalesce(p.periodo, d.periodo))
                             from periodos p full join devueltas_p d on d.periodo = p.periodo), '[]'::jsonb),
    'totales', jsonb_build_object(
      'ordenes', (select count(*) from entregadas), 'ventas', (select coalesce(sum(subtotal), 0) from entregadas), 'comisiones', (select coalesce(sum(comision), 0) from entregadas), 'neto', (select coalesce(sum(neto_vendedor), 0) from entregadas),
      'unidades', (select coalesce(sum(i.cantidad), 0) from entregadas e join public.orden_items i on i.orden_id = e.id),
      'compradores', (select count(distinct comprador_id) from entregadas), 'vendedores', (select count(distinct vendedor_id) from entregadas),
      'devoluciones', (select count(*) from devueltas), 'monto_devuelto', (select coalesce(sum(subtotal), 0) from devueltas),
      'ticket', (select coalesce(round(avg(subtotal), 2), 0) from entregadas),
      'usuarios_nuevos', (select count(*) from public.perfiles where creado_en >= d1 and creado_en < d2),
      'usuarios_total', (select count(*) from public.perfiles),
      'publicaciones_activas', (select count(*) from public.publicaciones where estado = 'activa'),
      'pagado_vendedores', (select coalesce(sum(monto), 0) from public.retiros where estado = 'pagado' and pagado_en >= d1 and pagado_en < d2)),
    'vendedores', coalesce((select jsonb_agg(x order by (x->>'monto')::numeric desc) from (
                     select jsonb_build_object('id', e.vendedor_id, 'username', u.username, 'ordenes', count(*), 'monto', sum(e.subtotal), 'comision', sum(e.comision), 'puntaje', u.reputacion->>'puntaje', 'faltas', u.reputacion->>'faltas_90') as x
                       from entregadas e join public.perfiles u on u.id = e.vendedor_id group by e.vendedor_id, u.username, u.reputacion limit 20) t), '[]'::jsonb),
    'compradores', coalesce((select jsonb_agg(x order by (x->>'monto')::numeric desc) from (
                     select jsonb_build_object('id', e.comprador_id, 'username', u.username, 'ordenes', count(*), 'monto', sum(e.subtotal)) as x
                       from entregadas e join public.perfiles u on u.id = e.comprador_id group by e.comprador_id, u.username limit 20) t), '[]'::jsonb),
    'cartas', coalesce((select jsonb_agg(x order by (x->>'monto')::numeric desc) from (
                     select jsonb_build_object('carta_id', i.carta_id, 'nombre', coalesce(public.nombre_carta_texto(i.carta_id), i.carta_id), 'unidades', sum(i.cantidad), 'monto', sum(i.cantidad * i.precio_pen)) as x
                       from entregadas e join public.orden_items i on i.orden_id = e.id group by i.carta_id limit 20) t), '[]'::jsonb),
    'estados', coalesce((select jsonb_object_agg(estado, n) from (select estado, count(*) as n from public.ordenes group by estado) s), '{}'::jsonb),
    'reclamos', jsonb_build_object('abiertos', (select count(*) from public.reclamos where estado = 'abierto'), 'periodo', (select count(*) from public.reclamos where creado >= d1 and creado < d2))
  ) into res;
  return res;
end;
$$;
grant execute on function public.reporte_ventas(date, date, text) to authenticated;   -- exige es_admin()

-- Detalle de órdenes entregadas en un rango (para la hoja "Órdenes" del Excel)
create or replace function public.reporte_ordenes(p_desde date, p_hasta date)
returns table (numero bigint, entregada_en timestamptz, comprador text, vendedor text, tienda text, cartas text, unidades bigint, subtotal numeric, comision numeric, neto_vendedor numeric, entregada_por text, estado text)
language sql
security definer
set search_path = public
stable
as $$
  select o.numero, o.entregada_en, c.username, v.username, t.nombre,
         (select string_agg(i.cantidad || '× ' || coalesce(public.nombre_carta_texto(i.carta_id), i.carta_id) || case when i.idioma <> '' then ' ' || i.idioma else '' end, '; ') from public.orden_items i where i.orden_id = o.id),
         (select coalesce(sum(i.cantidad), 0) from public.orden_items i where i.orden_id = o.id),
         o.subtotal, o.comision, o.neto_vendedor, o.entregada_por, o.estado
    from public.ordenes o
    join public.perfiles c on c.id = o.comprador_id
    join public.perfiles v on v.id = o.vendedor_id
    left join public.tiendas t on t.id = o.tienda_id
   where public.es_admin()
     and o.estado in ('entregada', 'saldo_liberado')
     and o.entregada_en >= (p_desde::text || ' 00:00')::timestamp at time zone 'America/Lima'
     and o.entregada_en < ((p_hasta + 1)::text || ' 00:00')::timestamp at time zone 'America/Lima'
   order by o.entregada_en desc;
$$;
grant execute on function public.reporte_ordenes(date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Final: recalcular la reputación cacheada con la versión más nueva de actualizar_reputacion
-- (debe quedar al final del archivo)
-- ----------------------------------------------------------------------------
-- Reputación inicial de quienes ya vendieron
do $$
declare u record;
begin
  for u in select distinct vendedor_id from public.ordenes where vendedor_id is not null loop
    perform public.actualizar_reputacion(u.vendedor_id);
  end loop;
end;
$$;
