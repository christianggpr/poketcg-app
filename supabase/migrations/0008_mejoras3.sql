-- PokéTCG v2 · Mejoras 3 (portadas, fondo de la app y agregar rápido desde el álbum)
-- Idempotente: se puede pegar las veces que haga falta en el SQL Editor de Supabase. No borra datos.
--
-- Contenido:
--   A. Álbumes personalizados: color de la portada (uno de 8) y marca de agua (emblema PokéTCG, un patrón o ninguna).
--      Los álbumes que ya existen reciben el color por defecto (azul) y el emblema.
--   B. Fondo de la app por usuario (Ajustes → Apariencia → Fondo de la app): patrón e intensidad, guardados en el
--      perfil para que se mantengan en el celular y en la PC.
--   C. Agregar rápido desde el álbum: no necesita cambios en la base.

-- ----------------------------------------------------------------------------
-- A. Portada de los álbumes personalizados
-- ----------------------------------------------------------------------------
alter table public.albumes add column if not exists color      text not null default '#1F5FCC';   -- #E2571E, #1F5FCC, #1E8A57, #7C4DDB, #C99A00, #D23B30, #1C2340, #0E7C86
alter table public.albumes add column if not exists marca_agua text not null default 'emblema';   -- emblema | llamas | olas | hojas | rayos | estrellas | ninguna
alter table public.albumes drop constraint if exists albumes_color_valido;
alter table public.albumes add constraint albumes_color_valido check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.albumes drop constraint if exists albumes_marca_agua_valida;
alter table public.albumes add constraint albumes_marca_agua_valida check (marca_agua in ('emblema', 'llamas', 'olas', 'hojas', 'rayos', 'estrellas', 'ninguna'));

-- ----------------------------------------------------------------------------
-- B. Fondo de la app por usuario
-- ----------------------------------------------------------------------------
alter table public.perfiles add column if not exists fondo            text not null default 'hojas';   -- liso | llamas | olas | hojas | rayos | estrellas | aleatorio
alter table public.perfiles add column if not exists fondo_intensidad int  not null default 40;        -- 0–100 (40 ≈ 8 % de opacidad real)
alter table public.perfiles drop constraint if exists perfiles_fondo_valido;
alter table public.perfiles add constraint perfiles_fondo_valido check (fondo in ('liso', 'llamas', 'olas', 'hojas', 'rayos', 'estrellas', 'aleatorio'));
alter table public.perfiles drop constraint if exists perfiles_fondo_intensidad_valida;
alter table public.perfiles add constraint perfiles_fondo_intensidad_valida check (fondo_intensidad between 0 and 100);
