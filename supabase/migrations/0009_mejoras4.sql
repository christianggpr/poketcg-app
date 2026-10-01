-- PokéTCG v2 · Mejoras 4 (filtros, búsqueda, álbum grande y Pokédex)
-- Idempotente: se puede pegar las veces que haga falta en el SQL Editor de Supabase. No borra datos.
-- No hace falta activar ninguna extensión: la búsqueda tolerante a errores ("¿Quisiste decir…?") se hace en el navegador
-- con el catálogo ya descargado.
--
-- Contenido:
--   C. Pokédex: la carta elegida para cada casilla (especie) y la opción de ocultar el álbum Pokédex.
--   D. Mercado: la función mercado_resumen admite más filtros (tipo, rareza, ilustrador, con foto real, vendedor con buena
--      reputación) y más órdenes (más vendidas, nombre). Los bloques A, B, E y F no necesitan cambios en la base.

-- ----------------------------------------------------------------------------
-- C. Pokédex
-- ----------------------------------------------------------------------------
create table if not exists public.pokedex_elecciones (
  usuario_id     uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  dex            int  not null,                                                   -- n.º de Pokédex nacional (1–1025)
  carta_id       text not null references public.cartas (id) on delete cascade,  -- la carta que se muestra en esa casilla
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, dex)
);
alter table public.pokedex_elecciones enable row level security;
drop policy if exists "pokedex propias" on public.pokedex_elecciones;
create policy "pokedex propias" on public.pokedex_elecciones for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
grant select, insert, update, delete on public.pokedex_elecciones to authenticated;
alter table public.perfiles add column if not exists pokedex_oculto boolean not null default false;

-- ----------------------------------------------------------------------------
-- D. Mercado: resumen por carta con más filtros y órdenes
--    (se reemplaza la función anterior para que haya una sola firma; los parámetros antiguos siguen igual)
-- ----------------------------------------------------------------------------
drop function if exists public.mercado_resumen(text[], text, text, text, text, numeric, numeric, text, int, int);
create or replace function public.mercado_resumen(
  p_cartas text[] default null, p_set text default '', p_idioma text default '', p_acabado text default '',
  p_condicion text default '', p_min numeric default null, p_max numeric default null,
  p_orden text default 'novedad', p_limite int default 60, p_desde int default 0,
  p_tipo text default '', p_rareza text default '', p_ilustrador text default '',
  p_con_foto boolean default false, p_reputacion boolean default false)
returns table (carta_id text, copias bigint, precio_min numeric, precio_max numeric, vendedores text[], ofertas bigint, ultima timestamptz, vendidas bigint)
language sql
stable
as $$
  with v as (
    select vp.carta_id, sum(vp.cantidad)::bigint as vendidas
      from public.ventas_publicas vp
     where vp.entregada_en > now() - interval '90 days'
     group by vp.carta_id
  )
  select m.carta_id, sum(m.disponibles)::bigint, min(m.precio_pen), max(m.precio_pen),
         (array_agg(distinct m.vendedor))[1:5], count(*)::bigint, max(m.creada), coalesce(max(v.vendidas), 0)::bigint
    from public.mercado m
    join public.cartas c on c.id = m.carta_id
    join public.vendedores_publicos u on u.id = m.vendedor_id   -- vista pública (la tabla perfiles tiene RLS por usuario)
    left join v on v.carta_id = m.carta_id
   where (p_cartas is null or m.carta_id = any(p_cartas))
     and (coalesce(p_set, '') = '' or c.coleccion_id = p_set)
     and (coalesce(p_idioma, '') = '' or m.idioma = p_idioma)
     and (coalesce(p_acabado, '') = '' or m.acabado = p_acabado)
     and (coalesce(p_condicion, '') = '' or m.condicion = p_condicion)
     and (p_min is null or m.precio_pen >= p_min)
     and (p_max is null or m.precio_pen <= p_max)
     and (coalesce(p_tipo, '') = '' or p_tipo = any(coalesce(c.tipos, '{}')))
     and (coalesce(p_rareza, '') = '' or c.rareza = p_rareza)
     and (coalesce(p_ilustrador, '') = '' or c.ilustrador = p_ilustrador)
     and (not coalesce(p_con_foto, false) or coalesce(array_length(m.fotos, 1), 0) > 0)
     -- buena reputación: sin alerta, 3 ventas o más y 4 estrellas o más (o sin reseñas todavía)
     and (not coalesce(p_reputacion, false) or (
           coalesce(u.reputacion->>'alerta', '') = ''
           and coalesce((u.reputacion->>'ventas')::int, 0) >= 3
           and coalesce((u.reputacion->>'puntaje')::numeric, 5) >= 4))
   group by m.carta_id, c.nombre
   order by case when p_orden = 'precio' then min(m.precio_pen) end asc,
            case when p_orden = 'valor' then max(m.precio_pen) end desc,
            case when p_orden = 'novedad' then max(m.creada) end desc,
            case when p_orden = 'ventas' then coalesce(max(v.vendidas), 0) end desc,
            case when p_orden = 'nombre' then c.nombre end asc,
            m.carta_id
   limit greatest(1, least(coalesce(p_limite, 60), 500)) offset greatest(0, coalesce(p_desde, 0));
$$;
grant execute on function public.mercado_resumen(text[], text, text, text, text, numeric, numeric, text, int, int, text, text, text, boolean, boolean) to authenticated, anon;
