-- PokéTCG v2 · Mejoras 2 · bloque B: el álbum es lo principal; el Bulk guarda las repetidas.
-- Idempotente: se puede pegar varias veces en el SQL Editor de Supabase. No borra datos.
--
--   dividir_entrada(p_entrada, p_cantidad, p_caja, p_album)
--     Separa p_cantidad copias de una entrada en una entrada nueva: en un Bulk (p_caja) o en el álbum por
--     colección (p_album). Si la entrada estaba publicada, la publicación sigue a las copias que van al Bulk
--     (las repetidas son las que se venden); si también estaba publicada la copia que se queda en el álbum,
--     esa copia recibe otra publicación igual. Nunca toca publicaciones con copias reservadas por un comprador.
--   ordenar_repetidas(p_caja, p_items)
--     Asistente "Ordenar repetidas": manda a un Bulk las copias de más de los álbumes, varias entradas en una
--     sola transacción. p_items = [{"entrada": uuid, "cantidad": n, "todo": true|false}, …]
--     (todo = true: la entrada completa pasa al Bulk; false: se separan n copias y 1 se queda en la casilla).
--   llenar_albumes(p_items)
--     Asistente "Llenar álbumes desde Bulk": lleva al álbum por colección 1 copia de cada entrada indicada.
--     p_items = [{"entrada": uuid, "set": "sv03.5"}, …]

create or replace function public.dividir_entrada(p_entrada uuid, p_cantidad int, p_caja uuid default null, p_album text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  e record;
  p record;
  nueva uuid;
  pos int;
  venta boolean := false;
  copia_album int := 0;
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  select * into e from public.entradas where id = p_entrada and usuario_id = yo for update;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'La carta no existe'); end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad >= e.cantidad then return jsonb_build_object('ok', false, 'error', 'Cantidad inválida: deben quedar copias en la entrada original'); end if;
  if (p_caja is null) = (p_album is null) then return jsonb_build_object('ok', false, 'error', 'Indica un Bulk o un álbum'); end if;
  if p_caja is not null then
    select en_venta into venta from public.cajas where id = p_caja and usuario_id = yo;
    if not found then return jsonb_build_object('ok', false, 'error', 'El Bulk no existe'); end if;
    select coalesce(max(posicion), 0) + 1 into pos from public.entradas where caja_id = p_caja;
  else
    if e.carta_id is null or not exists (select 1 from public.cartas where id = e.carta_id and coleccion_id = p_album) then
      return jsonb_build_object('ok', false, 'error', 'Esa carta no es de esa colección');
    end if;
  end if;
  select * into p from public.publicaciones where entrada_id = e.id and estado in ('activa', 'pausada', 'reservada') limit 1;
  if p.id is not null and (p.estado = 'reservada' or coalesce(p.reservadas, 0) > 0) then
    return jsonb_build_object('ok', false, 'error', 'Tiene copias reservadas por un comprador: espera a que termine esa compra');
  end if;
  -- la entrada nueva nace sin Bulk (así la caja en venta no la publica sola antes de mover la publicación)
  insert into public.entradas (usuario_id, carta_id, personalizada, caja_id, cantidad, acabado, idioma, condicion, nota, posicion, album_coleccion, compra_orden_id)
  values (yo, e.carta_id, e.personalizada, null, p_cantidad, e.acabado, e.idioma, e.condicion, e.nota, pos, p_album, e.compra_orden_id)
  returning id into nueva;
  if p.id is not null and p_caja is not null then
    -- la publicación sigue a las copias que van al Bulk
    update public.publicaciones set entrada_id = nueva, cantidad = least(p.cantidad, p_cantidad) where id = p.id;
    copia_album := p.cantidad - least(p.cantidad, p_cantidad);
    if copia_album > 0 then
      -- también estaba en venta la copia que se queda en el álbum: otra publicación igual (sin fotos: la regla de la foto la pausa si pasa de S/ 50)
      insert into public.publicaciones (usuario_id, entrada_id, cantidad, tipo_precio, precio_pen, estado)
      values (yo, e.id, copia_album, p.tipo_precio, p.precio_pen, case when p.estado = 'pausada' and coalesce(p.motivo_pausa, '') <> 'foto' then 'pausada' else 'activa' end);
    end if;
  end if;
  -- ahora sí entra al Bulk (si la caja está en venta y no traía publicación, la caja la publica sola, como siempre)
  if p_caja is not null then update public.entradas set caja_id = p_caja where id = nueva; end if;
  update public.entradas set cantidad = cantidad - p_cantidad where id = e.id;
  return jsonb_build_object('ok', true, 'nueva', nueva, 'posicion', pos, 'publicacion_movida', p.id is not null and p_caja is not null, 'copia_album_publicada', copia_album);
end;
$$;
grant execute on function public.dividir_entrada(uuid, int, uuid, text) to authenticated;

create or replace function public.ordenar_repetidas(p_caja uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  it jsonb;
  e record;
  r jsonb;
  pos int;
  movidas int := 0;
  copias int := 0;
  omitidas jsonb := '[]'::jsonb;
  nuevas jsonb := '[]'::jsonb;
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  if not exists (select 1 from public.cajas where id = p_caja and usuario_id = yo) then return jsonb_build_object('ok', false, 'error', 'El Bulk no existe'); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return jsonb_build_object('ok', false, 'error', 'Lista inválida'); end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into e from public.entradas where id = (it->>'entrada')::uuid and usuario_id = yo for update;
    if e.id is null then omitidas := omitidas || jsonb_build_object('entrada', it->>'entrada', 'error', 'no existe'); continue; end if;
    if coalesce((it->>'todo')::boolean, false) or coalesce((it->>'cantidad')::int, 0) >= e.cantidad then
      -- la entrada completa pasa al Bulk: la publicación (si la hay) se queda con ella
      if exists (select 1 from public.publicaciones where entrada_id = e.id and estado in ('activa', 'pausada', 'reservada') and (estado = 'reservada' or coalesce(reservadas, 0) > 0)) then
        omitidas := omitidas || jsonb_build_object('entrada', e.id, 'error', 'reservada'); continue;
      end if;
      select coalesce(max(posicion), 0) + 1 into pos from public.entradas where caja_id = p_caja;
      update public.entradas set caja_id = p_caja, posicion = pos, album_coleccion = null where id = e.id;
      update public.album_casillas set entrada_id = null where entrada_id = e.id;
      movidas := movidas + 1; copias := copias + e.cantidad;
    else
      r := public.dividir_entrada(e.id, (it->>'cantidad')::int, p_caja, null);
      if coalesce((r->>'ok')::boolean, false) then
        movidas := movidas + 1; copias := copias + (it->>'cantidad')::int;
        nuevas := nuevas || jsonb_build_object('entrada', e.id, 'nueva', r->>'nueva');
      else
        omitidas := omitidas || jsonb_build_object('entrada', e.id, 'error', r->>'error');
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'movidas', movidas, 'copias', copias, 'omitidas', omitidas, 'nuevas', nuevas);
end;
$$;
grant execute on function public.ordenar_repetidas(uuid, jsonb) to authenticated;

create or replace function public.llenar_albumes(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  it jsonb;
  e record;
  r jsonb;
  movidas int := 0;
  omitidas jsonb := '[]'::jsonb;
begin
  if yo is null then return jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión'); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return jsonb_build_object('ok', false, 'error', 'Lista inválida'); end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into e from public.entradas where id = (it->>'entrada')::uuid and usuario_id = yo for update;
    if e.id is null then omitidas := omitidas || jsonb_build_object('entrada', it->>'entrada', 'error', 'no existe'); continue; end if;
    if e.carta_id is null or not exists (select 1 from public.cartas where id = e.carta_id and coleccion_id = it->>'set') then
      omitidas := omitidas || jsonb_build_object('entrada', e.id, 'error', 'colección distinta'); continue;
    end if;
    -- la casilla debe estar vacía (ninguna copia de esa carta en ese álbum con ese idioma)
    if exists (select 1 from public.entradas x where x.usuario_id = yo and x.id <> e.id and x.carta_id = e.carta_id and x.album_coleccion = it->>'set' and coalesce(x.idioma, '') = coalesce(e.idioma, '')) then
      omitidas := omitidas || jsonb_build_object('entrada', e.id, 'error', 'casilla ocupada'); continue;
    end if;
    if e.cantidad = 1 then
      if exists (select 1 from public.publicaciones where entrada_id = e.id and estado in ('activa', 'pausada', 'reservada') and (estado = 'reservada' or coalesce(reservadas, 0) > 0)) then
        omitidas := omitidas || jsonb_build_object('entrada', e.id, 'error', 'reservada'); continue;
      end if;
      update public.entradas set caja_id = null, posicion = null, album_coleccion = it->>'set' where id = e.id;
      update public.album_casillas set entrada_id = null where entrada_id = e.id;
      movidas := movidas + 1;
    else
      r := public.dividir_entrada(e.id, 1, null, it->>'set');
      if coalesce((r->>'ok')::boolean, false) then movidas := movidas + 1;
      else omitidas := omitidas || jsonb_build_object('entrada', e.id, 'error', r->>'error'); end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'movidas', movidas, 'omitidas', omitidas);
end;
$$;
grant execute on function public.llenar_albumes(jsonb) to authenticated;
