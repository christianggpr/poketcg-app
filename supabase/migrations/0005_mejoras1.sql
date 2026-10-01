-- PokéTCG v2 · Mejoras 1 (navegación, álbumes, Bulk, mercado y arreglos)
-- Idempotente: se puede pegar las veces que haga falta en el SQL Editor de Supabase. No borra datos.
--
-- Contenido:
--   1. Las cajas pasan a llamarse "Bulk" (solo el nombre que ve el usuario; las tablas siguen igual).
--   2. Una carta puede guardarse en un "álbum por colección" (entradas.album_coleccion) además de en un Bulk
--      o en un bolsillo de un álbum personalizado (album_casillas.entrada_id).
--   3. Textos de avisos que mencionaban cajas.

-- ----------------------------------------------------------------------------
-- 1. Bulk: los nombres por defecto "Caja N" pasan a "Bulk N" (los nombres propios no se tocan)
-- ----------------------------------------------------------------------------
update public.cajas set nombre = regexp_replace(nombre, '^Caja(\s+\d+)$', 'Bulk\1'), actualizado_en = now()
 where nombre ~ '^Caja\s+\d+$';

-- ----------------------------------------------------------------------------
-- 2. Ubicación en un álbum por colección: id de la colección (el idioma es el de la entrada)
-- ----------------------------------------------------------------------------
alter table public.entradas add column if not exists album_coleccion text;
create index if not exists entradas_por_album_coleccion on public.entradas (usuario_id, album_coleccion) where album_coleccion is not null;

-- Texto de ubicación para los avisos al vendedor ("Bulk «X»", "Álbum PRE EN" o "Sin ubicar")
create or replace function public.ubicacion_entrada_texto(p_entrada uuid)
returns text
language sql
stable
as $$
  select case when e.caja_id is not null then 'Bulk "' || c.nombre || '"'
              when e.album_coleccion is not null then 'Álbum ' || coalesce(s.abreviatura, s.nombre, e.album_coleccion) || case when coalesce(e.idioma, '') <> '' then ' ' || e.idioma else '' end
              when exists (select 1 from public.album_casillas ac where ac.entrada_id = e.id) then (select 'Álbum "' || a.nombre || '" bolsillo ' || (ac.indice + 1) from public.album_casillas ac join public.albumes a on a.id = ac.album_id where ac.entrada_id = e.id limit 1)
              else 'Sin ubicar' end
    from public.entradas e
    left join public.cajas c on c.id = e.caja_id
    left join public.colecciones_tcg s on s.id = e.album_coleccion
   where e.id = p_entrada;
$$;

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
