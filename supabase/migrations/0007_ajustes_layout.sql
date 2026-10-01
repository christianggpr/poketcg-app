-- PokéTCG v2 · Ajustes de layout · "ponerse al día" con la base de datos de producción
-- Idempotente: se puede pegar las veces que haga falta en el SQL Editor de Supabase. No borra datos.
--
-- Al revisar producción (1 de octubre de 2026) faltaban partes que se añadieron a archivos anteriores DESPUÉS de que
-- se pegaran (por eso nunca llegaron a la base real):
--   · 0003_fase3.sql · sección E  → stock al confirmar el pago (columnas orden_items.entrada_datos / descontado_en /
--                                   entrada_comprador_id, entradas.compra_orden_id), entregar_al_comprador, devolver_venta,
--                                   publicaciones_fotos_por_borrar. Sin esto, "marcar entregada" y las devoluciones fallan.
--   · 0004_fase4.sql · sección D  → tiendas_publicas, ventas_publicas (historial de ventas), favoritos (lista de deseos)
--                                   con su aviso, estadisticas_publicas (portada), columnas de tiendas (tarifa, mapa…).
--   · 0005_mejoras1.sql · sección 4 → mercado_destacados (carruseles del Inicio del Mercado).
-- Este archivo trae todo eso en el orden correcto, seguido de las versiones más nuevas de las funciones que esas
-- secciones reemplazan (revisar_pago y mantenimiento_ordenes de 0004; devolver_venta y marcar_entregada de 0005).
-- Es una copia literal de esos archivos: si ya estaban aplicados, no cambia nada.

-- ============================================================================
-- Parte 1 · 0003_fase3.sql, sección E (copia literal)
-- ============================================================================
-- E. Stock: las copias vendidas salen de la colección del vendedor al confirmarse el pago (no al entregar);
--    al confirmarse la entrega entran a la colección del comprador como "por colocar" (sin caja);
--    si la orden vence sin entrega, vuelven a la colección del vendedor (a su caja, si sigue existiendo).
-- ----------------------------------------------------------------------------
alter table public.entradas add column if not exists compra_orden_id uuid references public.ordenes (id) on delete set null;   -- entrada creada por una compra
create index if not exists entradas_por_compra on public.entradas (compra_orden_id) where compra_orden_id is not null;
alter table public.orden_items add column if not exists entrada_datos jsonb;              -- copia de la entrada del vendedor al descontarla (para devolverla si la orden vence)
alter table public.orden_items add column if not exists descontado_en timestamptz;        -- cuándo salió de la colección del vendedor
alter table public.orden_items add column if not exists entrada_comprador_id uuid;        -- entrada creada en la colección del comprador al entregarse

-- Descuenta las copias vendidas de la colección del vendedor (se llama al confirmar el pago; idempotente).
-- Guarda una copia de la entrada en orden_items.entrada_datos para poder devolverla.
create or replace function public.descontar_entrega(p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
  e record;
  hay boolean;
  pubs_vendidas uuid[] := '{}';
  n int := 0;
begin
  perform set_config('poketcg.interno', '1', true);
  for it in select * from public.orden_items where orden_id = p_orden and descontado_en is null loop
    if it.publicacion_id is not null then
      update public.publicaciones set vendidas = greatest(0, vendidas - it.cantidad) where id = it.publicacion_id;
    end if;
    hay := false;
    if it.entrada_id is not null then
      select * into e from public.entradas where id = it.entrada_id;
      hay := e.id is not null;   -- (un registro con campos nulos no es "is not null")
    end if;
    if hay then
      update public.orden_items set entrada_datos = to_jsonb(e), descontado_en = now() where id = it.id;
      if e.cantidad - it.cantidad <= 0 then
        if it.publicacion_id is not null then
          update public.publicaciones set entrada_id = null, estado = 'vendida', cantidad = 0, actualizada = now() where id = it.publicacion_id;
          pubs_vendidas := pubs_vendidas || it.publicacion_id;
        end if;
        delete from public.entradas where id = e.id;
      else
        update public.entradas set cantidad = e.cantidad - it.cantidad where id = e.id;
        -- la publicación sigue a la entrada aunque esté "reservada" por otro comprador (nunca más copias que las físicas)
        if it.publicacion_id is not null then
          update public.publicaciones set cantidad = least(cantidad, e.cantidad - it.cantidad) where id = it.publicacion_id;
        end if;
      end if;
    else
      update public.orden_items set descontado_en = now() where id = it.id;
      if it.publicacion_id is not null then
        update public.publicaciones set cantidad = greatest(0, cantidad - it.cantidad) where id = it.publicacion_id;
      end if;
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('publicaciones_vendidas', to_jsonb(pubs_vendidas), 'items', n);
end;
$$;
revoke all on function public.descontar_entrega(uuid) from public, anon, authenticated;

-- Devuelve las copias a la colección del vendedor (orden vencida): a la misma entrada si aún existe, o la vuelve a crear
-- con sus datos y en su caja (si la caja sigue existiendo) y reactiva la publicación que había quedado "vendida".
create or replace function public.devolver_venta(p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
  d jsonb;
  e record;
  pub record;
  caja uuid;
  hay_e boolean;
  hay_pub boolean;
  n int := 0;
begin
  perform set_config('poketcg.interno', '1', true);
  for it in select * from public.orden_items where orden_id = p_orden and descontado_en is not null loop
    d := it.entrada_datos;
    hay_e := false;
    if it.entrada_id is not null then
      select * into e from public.entradas where id = it.entrada_id;
      hay_e := e.id is not null;
    end if;
    if hay_e then
      update public.entradas set cantidad = e.cantidad + it.cantidad where id = e.id;
      -- la publicación recupera esas copias (el disparador solo baja la cantidad cuando la caja no está en venta)
      if it.publicacion_id is not null then
        update public.publicaciones set cantidad = cantidad + it.cantidad where id = it.publicacion_id and estado in ('activa', 'pausada', 'reservada');
      end if;
    elsif d is not null and it.carta_id is not null then
      caja := null;
      if (d->>'caja_id') is not null and exists (select 1 from public.cajas where id = (d->>'caja_id')::uuid and usuario_id = it.vendedor_id) then caja := (d->>'caja_id')::uuid; end if;
      -- primero sin caja (así no se auto-publica), luego se vuelve a enlazar la publicación y al final vuelve a su caja
      insert into public.entradas (id, usuario_id, carta_id, caja_id, cantidad, acabado, idioma, condicion, nota, posicion)
      values (coalesce((d->>'id')::uuid, gen_random_uuid()), it.vendedor_id, it.carta_id, null, it.cantidad, coalesce(d->>'acabado', it.acabado), coalesce(d->>'idioma', it.idioma), coalesce(d->>'condicion', it.condicion), coalesce(d->>'nota', ''), (d->>'posicion')::int)
      on conflict (id) do update set cantidad = public.entradas.cantidad + excluded.cantidad
      returning * into e;
      hay_pub := false;
      if it.publicacion_id is not null then
        select * into pub from public.publicaciones where id = it.publicacion_id;
        hay_pub := pub.id is not null;
      end if;
      if hay_pub and pub.estado = 'vendida' and pub.entrada_id is null then
        update public.publicaciones set entrada_id = e.id, estado = 'activa', cantidad = it.cantidad, vendidas = 0, reservadas = 0, actualizada = now() where id = pub.id;
      end if;
      if caja is not null then update public.entradas set caja_id = caja where id = e.id; end if;
    elsif it.publicacion_id is not null then
      update public.publicaciones set cantidad = cantidad + it.cantidad where id = it.publicacion_id;
    end if;
    update public.orden_items set descontado_en = null where id = it.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('devueltos', n);
end;
$$;
revoke all on function public.devolver_venta(uuid) from public, anon, authenticated;

-- Al entregarse, las cartas entran a la colección del comprador sin caja ("por colocar"); idempotente por ítem.
create or replace function public.entregar_al_comprador(p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  it record;
  e record;
  vendedor text;
  nuevas uuid[] := '{}';
begin
  select * into o from public.ordenes where id = p_orden;
  if o.id is null then return jsonb_build_object('entradas', '[]'::jsonb); end if;
  select username into vendedor from public.perfiles where id = o.vendedor_id;
  for it in select * from public.orden_items where orden_id = p_orden and entrada_comprador_id is null and carta_id is not null loop
    insert into public.entradas (usuario_id, carta_id, caja_id, cantidad, acabado, idioma, condicion, nota, compra_orden_id)
    values (o.comprador_id, it.carta_id, null, it.cantidad, coalesce(it.acabado, ''), coalesce(it.idioma, ''), coalesce(it.condicion, ''), 'Comprada en PokéTCG · orden #' || o.numero || ' a @' || coalesce(vendedor, '?'), p_orden)
    returning * into e;
    update public.orden_items set entrada_comprador_id = e.id where id = it.id;
    nuevas := nuevas || e.id;
  end loop;
  return jsonb_build_object('entradas', to_jsonb(nuevas));
end;
$$;
revoke all on function public.entregar_al_comprador(uuid) from public, anon, authenticated;

-- Publicaciones vendidas cuyas fotos ya se pueden borrar (ninguna orden en camino las referencia)
create or replace function public.publicaciones_fotos_por_borrar()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select p.id from public.publicaciones p
   where p.estado = 'vendida' and coalesce(array_length(p.fotos, 1), 0) > 0
     and not exists (select 1 from public.orden_items i join public.ordenes o on o.id = i.orden_id
                      where i.publicacion_id = p.id and o.estado in ('pago_confirmado', 'en_tienda'))
   limit 50;
$$;
revoke all on function public.publicaciones_fotos_por_borrar() from public, anon, authenticated;

-- El administrador confirma o rechaza un pago. Al confirmar, las copias salen de la colección del vendedor.
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

-- Entrega confirmada: las cartas entran a la colección del comprador (sin caja) y el saldo del vendedor queda listo.
create or replace function public.marcar_entregada(p_orden uuid, p_codigo text default null, p_modo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  o record;
  quien text;
  r jsonb;
  pubs uuid[];
begin
  select * into o from public.ordenes where id = p_orden for update;
  if o is null then return jsonb_build_object('ok', false, 'error', 'La orden no existe'); end if;
  if o.estado not in ('en_tienda', 'pago_confirmado') then return jsonb_build_object('ok', false, 'error', 'La orden no se puede marcar como entregada (' || o.estado || ')'); end if;
  if yo is null and p_modo = 'automatica' then quien := 'automatica';
  elsif yo = o.comprador_id then quien := 'comprador';
  elsif yo is not null and (select rol from public.perfiles where id = yo) = 'tienda' and (select tienda_id from public.perfiles where id = yo) = o.tienda_id then
    if regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g') <> o.codigo_retiro then return jsonb_build_object('ok', false, 'error', 'El código de retiro no coincide'); end if;
    quien := 'tienda';
  elsif public.es_admin() then quien := 'admin';
  else return jsonb_build_object('ok', false, 'error', 'Solo el comprador o la tienda pueden confirmar la entrega'); end if;
  update public.ordenes set estado = 'entregada', entregada_en = now(), entregada_por = quien, actualizada = now() where id = o.id;
  perform public.descontar_entrega(o.id);   -- por si la orden se confirmó antes de esta versión (idempotente)
  r := public.entregar_al_comprador(o.id);
  -- fotos de publicaciones agotadas que ya no tienen órdenes en camino: el servidor las borra del almacenamiento
  select coalesce(array_agg(distinct i.publicacion_id), '{}') into pubs
    from public.orden_items i join public.publicaciones p on p.id = i.publicacion_id
   where i.orden_id = o.id and p.estado = 'vendida'
     and not exists (select 1 from public.orden_items i2 join public.ordenes o2 on o2.id = i2.orden_id where i2.publicacion_id = p.id and o2.estado in ('pago_confirmado', 'en_tienda'));
  perform public.notificar(o.vendedor_id, 'entregada', '¡Orden #' || o.numero || ' entregada!', 'El comprador ya tiene sus cartas. Tu ganancia de S/ ' || to_char(o.neto_vendedor, 'FM999990.00') || ' queda lista para pagarte' || case when quien = 'automatica' then ' (confirmación automática)' else '' end || '.', '/app/ventas/ordenes/' || o.id, jsonb_build_object('orden_id', o.id), '{app,correo}');
  perform public.notificar(o.comprador_id, 'entregada_comprador', 'Orden #' || o.numero || ' entregada', case when quien = 'automatica' then 'Como no hubo reclamo en el plazo, la orden se dio por entregada.' else '¡Gracias por comprar!' end || ' Las cartas ya están en tu colección: colócalas en una caja desde Cajas → Por colocar.', '/app/cajas', jsonb_build_object('orden_id', o.id), '{app}');
  perform public.notificar_admins('entregada', 'Orden #' || o.numero || ' entregada (' || quien || ')', 'Vendedor @' || (select username from public.perfiles where id = o.vendedor_id) || ' · neto S/ ' || to_char(o.neto_vendedor, 'FM999990.00'), '/admin?tab=ordenes', jsonb_build_object('orden_id', o.id));
  return jsonb_build_object('ok', true, 'estado', 'entregada', 'por', quien, 'publicaciones_vendidas', to_jsonb(pubs)) || r;
end;
$$;

-- Orden vencida: las copias vuelven a la colección del vendedor (ya no solo al mercado)
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
  -- vencidas: pasó la fecha límite sin dejar la carta en la tienda → las copias vuelven al vendedor
  for o in select * from public.ordenes where estado = 'pago_confirmado' and fecha_limite < hoy loop
    update public.ordenes set estado = 'vencida', motivo = 'No se entregó en la tienda antes del ' || to_char(o.fecha_limite, 'DD/MM/YYYY'), actualizada = now() where id = o.id;
    perform public.devolver_venta(o.id);
    perform public.notificar_admins('orden_vencida', 'Orden #' || o.numero || ' vencida: devolver S/ ' || to_char(o.subtotal, 'FM999990.00'), 'El vendedor @' || (select username from public.perfiles where id = o.vendedor_id) || ' no entregó a tiempo. Devuelve el dinero al comprador @' || (select username from public.perfiles where id = o.comprador_id) || '.', '/admin?tab=ordenes', jsonb_build_object('orden_id', o.id));
    perform public.notificar(o.comprador_id, 'orden_vencida', 'Orden #' || o.numero || ' no se entregó a tiempo', 'El vendedor no dejó las cartas en la tienda dentro del plazo. Te devolveremos S/ ' || to_char(o.subtotal, 'FM999990.00') || ' por Yape/Plin; te escribiremos para coordinarlo.', '/app/compras/' || o.pago_id, jsonb_build_object('orden_id', o.id), '{app,correo}');
    perform public.notificar(o.vendedor_id, 'orden_vencida_vendedor', 'Orden #' || o.numero || ' vencida', 'No se registró la entrega en la tienda antes del ' || to_char(o.fecha_limite, 'DD/MM/YYYY') || '. La venta se anuló, las cartas volvieron a tu colección y queda registrada la falta.', '/app/ventas/ordenes/' || o.id, jsonb_build_object('orden_id', o.id), '{app,correo}');
    venc := venc + 1;
  end loop;
  return jsonb_build_object('confirmadas_auto', auto, 'recordatorios', rec, 'recordatorios_vendedor', rec_v, 'vencidas', venc);
end;
$$;
revoke all on function public.mantenimiento_ordenes(int) from public, anon, authenticated;

-- Órdenes confirmadas antes de esta versión: sus copias salen ahora de la colección del vendedor (una sola vez)
do $$
declare o record;
begin
  for o in select distinct oi.orden_id from public.orden_items oi join public.ordenes ord on ord.id = oi.orden_id
            where ord.estado in ('pago_confirmado', 'en_tienda') and oi.descontado_en is null loop
    perform public.descontar_entrega(o.orden_id);
  end loop;
end;
$$;

-- ============================================================================
-- Parte 2 · 0004_fase4.sql: revisar_pago y mantenimiento_ordenes (versiones de la fase 4, copia literal)
-- ============================================================================
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

-- ============================================================================
-- Parte 3 · 0004_fase4.sql, sección D y bloque final (copia literal)
-- ============================================================================
-- ----------------------------------------------------------------------------
-- D. Confianza pública: tiendas visibles sin cuenta (mapa, tarifa de recojo), historial de ventas
--    por carta, cifras de la comunidad y favoritos (lista de deseos) con aviso cuando aparece una oferta
-- ----------------------------------------------------------------------------
alter table public.tiendas add column if not exists tarifa_recojo numeric(10,2) not null default 0;   -- lo que cobra la tienda al recoger (0 = gratis)
alter table public.tiendas add column if not exists mapa_url text not null default '';                -- enlace "cómo llegar" (Google Maps u otro)
alter table public.tiendas add column if not exists lat double precision;                             -- coordenadas para el mapa (opcional)
alter table public.tiendas add column if not exists lon double precision;
alter table public.tiendas add column if not exists instagram text not null default '';

-- Datos de las tiendas activas que cualquiera puede ver (sin cuenta): no hay datos personales aquí
create or replace view public.tiendas_publicas as
  select id, nombre, distrito, direccion, referencia, horario, dias_abierto, telefono, tarifa_recojo, mapa_url, lat, lon, instagram, creada
    from public.tiendas
   where activa;
grant select on public.tiendas_publicas to authenticated, anon;

-- Historial de ventas por carta (órdenes entregadas): precio, estado, idioma y fecha; el comprador nunca se muestra
create or replace view public.ventas_publicas as
  select i.carta_id, i.cantidad, i.precio_pen, i.acabado, i.idioma, i.condicion, o.entregada_en, u.username as vendedor
    from public.orden_items i
    join public.ordenes o on o.id = i.orden_id
    join public.perfiles u on u.id = i.vendedor_id
   where o.estado in ('entregada', 'saldo_liberado') and o.entregada_en is not null;
grant select on public.ventas_publicas to authenticated, anon;

-- Favoritos / lista de deseos
create table if not exists public.favoritos (
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  carta_id   text not null references public.cartas (id),
  creado     timestamptz not null default now(),
  primary key (usuario_id, carta_id)
);
create index if not exists favoritos_por_carta on public.favoritos (carta_id);
alter table public.favoritos enable row level security;
drop policy if exists "favoritos propios" on public.favoritos;
create policy "favoritos propios" on public.favoritos for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
grant select, insert, delete on public.favoritos to authenticated;

-- Aviso a quienes tienen la carta en favoritos cuando se publica (o se reactiva) una oferta; como máximo uno al día por carta
create or replace function public.avisar_favoritos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  nombre text;
begin
  if new.estado <> 'activa' or new.carta_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.estado = 'activa' then return new; end if;
  nombre := coalesce(public.nombre_carta_texto(new.carta_id), new.carta_id);
  for f in select usuario_id from public.favoritos where carta_id = new.carta_id and usuario_id <> new.usuario_id loop
    if not exists (select 1 from public.notificaciones n where n.usuario_id = f.usuario_id and n.tipo = 'favorito' and n.datos->>'carta_id' = new.carta_id and n.creada > now() - interval '24 hours') then
      perform public.notificar(f.usuario_id, 'favorito', '❤️ ' || nombre || ' está en venta',
        'Una carta de tu lista de deseos acaba de publicarse a S/ ' || to_char(new.precio_pen, 'FM999990.00') || '. Entra antes de que se la lleven.',
        '/app/carta/' || new.carta_id, jsonb_build_object('carta_id', new.carta_id, 'publicacion_id', new.id), '{app,correo}');
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists publicaciones_avisar_favoritos on public.publicaciones;
create trigger publicaciones_avisar_favoritos after insert or update of estado on public.publicaciones for each row execute function public.avisar_favoritos();

-- Cifras de la comunidad y novedades para la portada (sin datos personales; solo nombres de usuario de vendedores)
create or replace function public.estadisticas_publicas()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'usuarios', (select count(*) from public.perfiles),
    'cartas_registradas', (select coalesce(sum(cantidad), 0) from public.entradas),
    'en_venta', (select coalesce(sum(disponibles), 0) from public.mercado),
    'publicaciones', (select count(*) from public.mercado),
    'vendidas', (select coalesce(sum(cantidad), 0) from public.ventas_publicas),
    'ventas', (select count(*) from public.ordenes where estado in ('entregada', 'saldo_liberado')),
    'vendedores', (select count(distinct vendedor_id) from public.ordenes where estado in ('entregada', 'saldo_liberado')),
    'tiendas', (select count(*) from public.tiendas where activa),
    'ultimas_ventas', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select carta_id, precio_pen, condicion, idioma, acabado, entregada_en from public.ventas_publicas order by entregada_en desc limit 8) x),
    'recientes', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select id, carta_id, precio_pen, condicion, idioma, acabado, vendedor, creada from public.mercado order by creada desc limit 8) x),
    'mas_vendidas', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select carta_id, sum(cantidad) as unidades, min(precio_pen) as desde, max(entregada_en) as ultima from public.ventas_publicas where entregada_en > now() - interval '90 days' group by carta_id order by 2 desc, 4 desc limit 8) x),
    'mas_deseadas', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select carta_id, count(*) as personas from public.favoritos group by carta_id order by 2 desc limit 8) x)
  );
$$;
grant execute on function public.estadisticas_publicas() to anon, authenticated;

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

-- ============================================================================
-- Parte 4 · 0005_mejoras1.sql, secciones 2 (devolver_venta), 3 (marcar_entregada) y 4 (mercado_destacados) (copia literal)
-- ============================================================================
-- Las copias devueltas por una venta anulada vuelven también a su álbum por colección
create or replace function public.devolver_venta(p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
  d jsonb;
  e record;
  pub record;
  caja uuid;
  hay_e boolean;
  hay_pub boolean;
  n int := 0;
begin
  perform set_config('poketcg.interno', '1', true);
  for it in select * from public.orden_items where orden_id = p_orden and descontado_en is not null loop
    d := it.entrada_datos;
    hay_e := false;
    if it.entrada_id is not null then
      select * into e from public.entradas where id = it.entrada_id;
      hay_e := e.id is not null;
    end if;
    if hay_e then
      update public.entradas set cantidad = e.cantidad + it.cantidad where id = e.id;
      -- la publicación recupera esas copias (el disparador solo baja la cantidad cuando la caja no está en venta)
      if it.publicacion_id is not null then
        update public.publicaciones set cantidad = cantidad + it.cantidad where id = it.publicacion_id and estado in ('activa', 'pausada', 'reservada');
      end if;
    elsif d is not null and it.carta_id is not null then
      caja := null;
      if (d->>'caja_id') is not null and exists (select 1 from public.cajas where id = (d->>'caja_id')::uuid and usuario_id = it.vendedor_id) then caja := (d->>'caja_id')::uuid; end if;
      -- primero sin caja (así no se auto-publica), luego se vuelve a enlazar la publicación y al final vuelve a su caja
      insert into public.entradas (id, usuario_id, carta_id, caja_id, cantidad, acabado, idioma, condicion, nota, posicion, album_coleccion)
      values (coalesce((d->>'id')::uuid, gen_random_uuid()), it.vendedor_id, it.carta_id, null, it.cantidad, coalesce(d->>'acabado', it.acabado), coalesce(d->>'idioma', it.idioma), coalesce(d->>'condicion', it.condicion), coalesce(d->>'nota', ''), (d->>'posicion')::int, nullif(d->>'album_coleccion', ''))
      on conflict (id) do update set cantidad = public.entradas.cantidad + excluded.cantidad
      returning * into e;
      hay_pub := false;
      if it.publicacion_id is not null then
        select * into pub from public.publicaciones where id = it.publicacion_id;
        hay_pub := pub.id is not null;
      end if;
      if hay_pub and pub.estado = 'vendida' and pub.entrada_id is null then
        update public.publicaciones set entrada_id = e.id, estado = 'activa', cantidad = it.cantidad, vendidas = 0, reservadas = 0, actualizada = now() where id = pub.id;
      end if;
      if caja is not null then update public.entradas set caja_id = caja where id = e.id; end if;
    elsif it.publicacion_id is not null then
      update public.publicaciones set cantidad = cantidad + it.cantidad where id = it.publicacion_id;
    end if;
    update public.orden_items set descontado_en = null where id = it.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('devueltos', n);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Aviso al comprador al entregarse la orden: ahora apunta a Mi Colección → Álbumes → Recibidas
-- ----------------------------------------------------------------------------
create or replace function public.marcar_entregada(p_orden uuid, p_codigo text default null, p_modo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  o record;
  quien text;
  r jsonb;
  pubs uuid[];
begin
  select * into o from public.ordenes where id = p_orden for update;
  if o is null then return jsonb_build_object('ok', false, 'error', 'La orden no existe'); end if;
  if o.estado not in ('en_tienda', 'pago_confirmado') then return jsonb_build_object('ok', false, 'error', 'La orden no se puede marcar como entregada (' || o.estado || ')'); end if;
  if yo is null and p_modo = 'automatica' then quien := 'automatica';
  elsif yo = o.comprador_id then quien := 'comprador';
  elsif yo is not null and (select rol from public.perfiles where id = yo) = 'tienda' and (select tienda_id from public.perfiles where id = yo) = o.tienda_id then
    if regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g') <> o.codigo_retiro then return jsonb_build_object('ok', false, 'error', 'El código de retiro no coincide'); end if;
    quien := 'tienda';
  elsif public.es_admin() then quien := 'admin';
  else return jsonb_build_object('ok', false, 'error', 'Solo el comprador o la tienda pueden confirmar la entrega'); end if;
  update public.ordenes set estado = 'entregada', entregada_en = now(), entregada_por = quien, actualizada = now() where id = o.id;
  perform public.descontar_entrega(o.id);   -- por si la orden se confirmó antes de esta versión (idempotente)
  r := public.entregar_al_comprador(o.id);
  -- fotos de publicaciones agotadas que ya no tienen órdenes en camino: el servidor las borra del almacenamiento
  select coalesce(array_agg(distinct i.publicacion_id), '{}') into pubs
    from public.orden_items i join public.publicaciones p on p.id = i.publicacion_id
   where i.orden_id = o.id and p.estado = 'vendida'
     and not exists (select 1 from public.orden_items i2 join public.ordenes o2 on o2.id = i2.orden_id where i2.publicacion_id = p.id and o2.estado in ('pago_confirmado', 'en_tienda'));
  perform public.notificar(o.vendedor_id, 'entregada', '¡Orden #' || o.numero || ' entregada!', 'El comprador ya tiene sus cartas. Tu ganancia de S/ ' || to_char(o.neto_vendedor, 'FM999990.00') || ' queda lista para pagarte' || case when quien = 'automatica' then ' (confirmación automática)' else '' end || '.', '/app/ventas/ordenes/' || o.id, jsonb_build_object('orden_id', o.id), '{app,correo}');
  perform public.notificar(o.comprador_id, 'entregada_comprador', 'Orden #' || o.numero || ' entregada', case when quien = 'automatica' then 'Como no hubo reclamo en el plazo, la orden se dio por entregada.' else '¡Gracias por comprar!' end || ' Las cartas ya están en tu colección: dinos dónde las guardas (álbum o Bulk) desde Mi Colección → Álbumes → Recibidas.', '/app/album', jsonb_build_object('orden_id', o.id), '{app}');
  perform public.notificar_admins('entregada', 'Orden #' || o.numero || ' entregada (' || quien || ')', 'Vendedor @' || (select username from public.perfiles where id = o.vendedor_id) || ' · neto S/ ' || to_char(o.neto_vendedor, 'FM999990.00'), '/admin?tab=ordenes', jsonb_build_object('orden_id', o.id));
  return jsonb_build_object('ok', true, 'estado', 'entregada', 'por', quien, 'publicaciones_vendidas', to_jsonb(pubs)) || r;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Inicio del Mercado (Mejoras 1 · D): destacados para los carruseles
--    "Más vendidas" (ventas de los últimos 30 días, solo cartas con copias disponibles; si hay pocas,
--    se completa con las más publicadas y las más deseadas) y "Mayor precio" (ofertas activas más caras).
-- ----------------------------------------------------------------------------
create or replace function public.mercado_destacados(p_limite int default 12)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with stock as (
    select m.carta_id, min(m.precio_pen) as desde, max(m.precio_pen) as hasta, sum(m.disponibles)::int as copias, count(*)::int as ofertas, max(m.creada) as ultima
      from public.mercado m group by m.carta_id
  ), vendidas as (
    select v.carta_id, sum(v.cantidad)::int as vendidas, max(v.entregada_en) as ultima_venta
      from public.ventas_publicas v where v.entregada_en > now() - interval '30 days' group by v.carta_id
  ), deseadas as (
    select f.carta_id, count(*)::int as personas from public.favoritos f group by f.carta_id
  ), candidatas as (
    select s.carta_id, s.desde, s.hasta, s.copias, s.ofertas, coalesce(v.vendidas, 0) as vendidas, coalesce(d.personas, 0) as deseadas,
           case when v.vendidas is not null then 'vendida' when d.personas is not null then 'deseada' else 'publicada' end as motivo
      from stock s left join vendidas v on v.carta_id = s.carta_id left join deseadas d on d.carta_id = s.carta_id
  )
  select jsonb_build_object(
    'mas_vendidas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select carta_id, desde, copias, ofertas, vendidas, deseadas, motivo
          from candidatas order by vendidas desc, deseadas desc, ofertas desc, copias desc limit p_limite) x), '[]'::jsonb),
    'mayor_precio', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select carta_id, desde, hasta, copias, ofertas
          from candidatas order by hasta desc, desde desc limit p_limite) x), '[]'::jsonb),
    'generado', now()
  );
$$;
grant execute on function public.mercado_destacados(int) to authenticated;
