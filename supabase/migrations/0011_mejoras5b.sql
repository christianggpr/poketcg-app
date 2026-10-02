-- PokéTCG v2 · Mejoras 5 · bloque B (tipos de álbum al crear)
-- Idempotente: se puede pegar las veces que haga falta en el SQL Editor de Supabase. No borra datos.
-- Cada álbum personalizado recuerda de qué es: Colección oficial · Un Pokémon · Un tipo · Un ilustrador · Cartas sueltas
-- (tipo_album) y sus parámetros (colección e idioma / n.º de Pokédex y si incluye evoluciones / tipo de energía / ilustrador).
-- Los álbumes que ya tenías quedan como "libre" (cartas sueltas). Sin este SQL la app funciona igual pero los álbumes nuevos
-- no recuerdan su tipo (se ven como "libre").
alter table public.albumes add column if not exists tipo_album text not null default 'libre';
alter table public.albumes add column if not exists parametros jsonb not null default '{}'::jsonb;
alter table public.albumes drop constraint if exists albumes_tipo_valido;
alter table public.albumes add constraint albumes_tipo_valido check (tipo_album in ('coleccion', 'pokemon', 'tipo', 'ilustrador', 'libre'));
