-- PokéTCG v2 · Mejoras 5 · bloque A (errores de álbumes)
-- Idempotente: se puede pegar las veces que haga falta en el SQL Editor de Supabase. No borra datos.
--
-- Qué arregla: antes, "Ya la tengo: guardar en mi colección" desde un bolsillo de un álbum personalizado guardaba la copia
-- en el álbum por colección de esa carta (album_coleccion) en vez de dejarla en el bolsillo. La app ya lo hace bien; este
-- script enlaza al bolsillo las copias que quedaron así, solo cuando no hay duda:
--   · el bolsillo tiene esa carta y ninguna copia enlazada;
--   · el usuario tiene UNA sola copia de esa carta, con cantidad 1, guardada en el álbum por colección (no en un Bulk);
--   · es la única carta de esa colección e idioma que tiene en ese álbum por colección (el álbum "apareció" solo por ella);
--   · esa carta está asignada a un solo bolsillo (sin copia) en sus álbumes personalizados.
-- Las demás no se tocan (si quieres moverlas: abre el bolsillo → "Traer aquí la de …").

do $$
declare
  n int;
begin
  drop table if exists arreglo_bolsillos;
  create temp table arreglo_bolsillos as
    select c.album_id, c.indice, e.id as entrada_id
      from public.album_casillas c
      join public.albumes a on a.id = c.album_id
      join public.entradas e on e.usuario_id = a.usuario_id and e.carta_id = c.carta_id
      join public.cartas k on k.id = e.carta_id
     where c.carta_id is not null and c.entrada_id is null
       and e.album_coleccion = k.coleccion_id and e.caja_id is null and e.cantidad = 1
       -- única copia de esa carta
       and not exists (select 1 from public.entradas e2 where e2.usuario_id = e.usuario_id and e2.carta_id = e.carta_id and e2.id <> e.id)
       -- única carta de esa colección e idioma en el álbum por colección
       and not exists (select 1 from public.entradas e3 join public.cartas k3 on k3.id = e3.carta_id
                        where e3.usuario_id = e.usuario_id and e3.id <> e.id and k3.coleccion_id = k.coleccion_id
                          and e3.album_coleccion = k.coleccion_id and coalesce(e3.idioma, '') = coalesce(e.idioma, ''))
       -- la copia no está ya en otro bolsillo
       and not exists (select 1 from public.album_casillas c2 where c2.entrada_id = e.id)
       -- un solo bolsillo (sin copia) con esa carta entre sus álbumes
       and (select count(*) from public.album_casillas c4 join public.albumes a4 on a4.id = c4.album_id
             where a4.usuario_id = a.usuario_id and c4.carta_id = c.carta_id and c4.entrada_id is null) = 1;

  update public.album_casillas c
     set entrada_id = x.entrada_id
    from arreglo_bolsillos x
   where c.album_id = x.album_id and c.indice = x.indice;

  update public.entradas e
     set album_coleccion = null, caja_id = null, posicion = null
    from arreglo_bolsillos x
   where e.id = x.entrada_id;

  select count(*) into n from arreglo_bolsillos;
  raise notice 'Mejoras 5 · A: % copia(s) enlazada(s) a su bolsillo', n;
  drop table arreglo_bolsillos;
end $$;
