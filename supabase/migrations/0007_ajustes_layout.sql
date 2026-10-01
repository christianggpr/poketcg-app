-- PokéTCG v2 · Ajustes de layout · 1: los carruseles del Inicio del Mercado ("Más vendidas" y "Mayor precio").
-- En producción faltaba la función public.mercado_destacados (se añadió a 0005_mejoras1.sql después de que se pegara
-- aquel archivo). Este archivo solo la vuelve a crear; es idempotente y no toca datos ni reglas de negocio.
-- La app, además, tiene un respaldo que arma los carruseles desde la vista `mercado` si la función no existe.

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
