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

-- Reputación inicial de quienes ya vendieron
do $$
declare u record;
begin
  for u in select distinct vendedor_id from public.ordenes where vendedor_id is not null loop
    perform public.actualizar_reputacion(u.vendedor_id);
  end loop;
end;
$$;
