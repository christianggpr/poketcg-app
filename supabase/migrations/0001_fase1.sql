-- ============================================================================
-- PokéTCG · Fase 1 · migración 0001
-- Pegar completo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Perfiles de usuario (uno por cuenta de Supabase Auth)
--    Datos sensibles (DNI, celular) solo los ve su dueño; nunca otros usuarios.
-- ----------------------------------------------------------------------------
create table if not exists public.perfiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          text not null,
  nombres           text not null default '',
  apellidos         text not null default '',
  email             text not null default '',
  telefono          text,
  dni               text,
  rol               text not null default 'usuario',
  acepto_terminos_en timestamptz,
  idioma_nombres    text not null default 'es',
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  constraint perfiles_username_formato check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint perfiles_telefono_formato check (telefono is null or telefono ~ '^9[0-9]{8}$'),
  constraint perfiles_dni_formato check (dni is null or dni ~ '^[0-9]{8}$'),
  constraint perfiles_rol_valido check (rol in ('usuario', 'admin')),
  constraint perfiles_idioma_valido check (idioma_nombres in ('es', 'en', 'ja'))
);
create unique index if not exists perfiles_username_unico on public.perfiles (lower(username));
create unique index if not exists perfiles_email_unico on public.perfiles (lower(email));
create unique index if not exists perfiles_dni_unico on public.perfiles (dni) where dni is not null;

-- Crea el perfil automáticamente al registrarse (los datos vienen en user_metadata).
create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  u text := nullif(trim(d->>'username'), '');
begin
  if u is null or u !~ '^[A-Za-z0-9_]{3,20}$' then
    u := 'u_' || replace(left(new.id::text, 12), '-', '');
  end if;
  insert into public.perfiles (id, username, nombres, apellidos, email, telefono, dni, acepto_terminos_en)
  values (
    new.id,
    lower(u),
    coalesce(d->>'nombres', ''),
    coalesce(d->>'apellidos', ''),
    lower(coalesce(new.email, '')),
    case when d->>'telefono' ~ '^9[0-9]{8}$' then d->>'telefono' else null end,
    case when d->>'dni' ~ '^[0-9]{8}$' then d->>'dni' else null end,
    case when (d->>'acepto_terminos')::boolean then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- Mantiene el correo del perfil sincronizado si el usuario cambia su email.
create or replace function public.sincronizar_email_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles set email = lower(coalesce(new.email, '')), actualizado_en = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists al_cambiar_email on auth.users;
create trigger al_cambiar_email
  after update of email on auth.users
  for each row execute function public.sincronizar_email_perfil();

-- El usuario no puede cambiarse el rol, el DNI ni el correo desde la app
-- (solo el servidor con la clave service_role, o el administrador desde el SQL Editor).
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
  end if;
  new.username := lower(new.username);
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists antes_de_editar_perfil on public.perfiles;
create trigger antes_de_editar_perfil
  before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- Vista pública: solo lo que otros usuarios podrán ver en fases futuras.
create or replace view public.perfiles_publicos as
  select id, username, nombres, creado_en from public.perfiles;

-- ----------------------------------------------------------------------------
-- 2. Catálogo de cartas (compartido, solo lectura para los usuarios)
-- ----------------------------------------------------------------------------
create table if not exists public.colecciones_tcg (
  id             text primary key,             -- 'sv03.5', 'jp-SV2a'
  nombre         text not null,                -- nombre en inglés
  nombre_es      text,
  nombre_ja      text,
  serie_id       text,
  serie          text,
  serie_es       text,
  abreviatura    text,                         -- código impreso (MEW, PRE…)
  total_impreso  int,                          -- el "/165" de la carta
  total_cartas   int,                          -- total con secretas
  fecha          date,
  tcgdex_id      text,
  region         text not null default 'int',  -- 'int' internacional, 'ja' Japón
  ptcgio_id      text,
  simbolo_url    text,
  constraint colecciones_region_valida check (region in ('int', 'ja'))
);

create table if not exists public.cartas (
  id             text primary key,             -- 'sv03.5-025', 'jp-SV2a-025'
  coleccion_id   text not null references public.colecciones_tcg (id) on delete cascade,
  numero         text not null,                -- tal como está impreso ('025', 'TG01', 'SWSH001')
  numero_orden   int,                          -- parte numérica para ordenar
  nombre         text not null,
  nombre_es      text,
  nombre_ja      text,
  categoria      text not null default 'P',    -- P pokémon, T entrenador, E energía, ? sin datos
  rareza         text,
  tipos          text[],
  dex            int[],
  hp             int,
  ilustrador     text,
  regulacion     text,
  ptcgio_id      text,
  sin_datos      boolean not null default false,
  constraint cartas_categoria_valida check (categoria in ('P', 'T', 'E', '?'))
);
create index if not exists cartas_por_coleccion on public.cartas (coleccion_id, numero_orden, numero);

-- Precios de venta (caché compartida; la rellena el servidor desde TCGdex)
create table if not exists public.precios (
  carta_id        text not null references public.cartas (id) on delete cascade,
  datos           jsonb not null,              -- {tp:{normal:1.2,...}, cm:{trend:..., holo:...}, ok:true}
  actualizado_en  timestamptz not null default now(),
  primary key (carta_id)
);

-- Valores globales del servidor (tipo de cambio, avisos…); solo los escribe el servidor.
create table if not exists public.ajustes_globales (
  clave           text primary key,
  valor           jsonb not null,
  actualizado_en  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Colección de cada usuario: cajas, entradas (cartas físicas) y álbumes
-- ----------------------------------------------------------------------------
create table if not exists public.cajas (
  id                 uuid primary key default gen_random_uuid(),
  usuario_id         uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  nombre             text not null,
  descripcion        text not null default '',
  orden              int not null default 1,
  modo               text not null default 'auto',   -- 'auto' (por colección y número) | 'manual'
  orden_colecciones  text not null default 'asc',    -- 'asc' antiguas primero | 'desc' nuevas primero
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  constraint cajas_modo_valido check (modo in ('auto', 'manual')),
  constraint cajas_orden_valido check (orden_colecciones in ('asc', 'desc'))
);
create index if not exists cajas_por_usuario on public.cajas (usuario_id, orden);

create table if not exists public.entradas (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  carta_id        text references public.cartas (id),
  personalizada   jsonb,                        -- {nombre, coleccion, numero} si no está en el catálogo
  caja_id         uuid references public.cajas (id) on delete set null,
  cantidad        int not null default 1,
  acabado         text not null default '',     -- '', 'Normal', 'Reverse', 'Holo', 'Otra'
  idioma          text not null default '',     -- 'ES', 'EN', 'JP', 'PT', 'FR', 'DE', 'IT', 'Otro'
  condicion       text not null default '',
  nota            text not null default '',
  posicion        int,                          -- posición manual dentro de la caja
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint entradas_cantidad_positiva check (cantidad > 0),
  constraint entradas_carta_o_personalizada check (carta_id is not null or personalizada is not null)
);
create index if not exists entradas_por_usuario on public.entradas (usuario_id, caja_id);
create index if not exists entradas_por_carta on public.entradas (usuario_id, carta_id);

create table if not exists public.albumes (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  nombre          text not null,
  descripcion     text not null default '',
  paginas         int not null default 10,
  columnas        int not null default 3,
  filas           int not null default 3,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint albumes_paginas check (paginas between 1 and 300),
  constraint albumes_columnas check (columnas between 1 and 6),
  constraint albumes_filas check (filas between 1 and 6)
);
create index if not exists albumes_por_usuario on public.albumes (usuario_id);

create table if not exists public.album_casillas (
  album_id    uuid not null references public.albumes (id) on delete cascade,
  indice      int not null,                     -- 0 = primera casilla de la primera página
  carta_id    text references public.cartas (id),
  entrada_id  uuid references public.entradas (id) on delete set null,
  primary key (album_id, indice)
);

-- actualizado_en automático
create or replace function public.marcar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists cajas_actualizado on public.cajas;
create trigger cajas_actualizado before update on public.cajas for each row execute function public.marcar_actualizado();
drop trigger if exists entradas_actualizado on public.entradas;
create trigger entradas_actualizado before update on public.entradas for each row execute function public.marcar_actualizado();
drop trigger if exists albumes_actualizado on public.albumes;
create trigger albumes_actualizado before update on public.albumes for each row execute function public.marcar_actualizado();

-- ----------------------------------------------------------------------------
-- 4. Seguridad por filas (RLS): cada usuario solo ve y edita lo suyo
-- ----------------------------------------------------------------------------
alter table public.perfiles        enable row level security;
alter table public.colecciones_tcg enable row level security;
alter table public.cartas          enable row level security;
alter table public.precios         enable row level security;
alter table public.ajustes_globales enable row level security;
alter table public.cajas           enable row level security;
alter table public.entradas        enable row level security;
alter table public.albumes         enable row level security;
alter table public.album_casillas  enable row level security;

drop policy if exists "perfil propio: ver" on public.perfiles;
create policy "perfil propio: ver" on public.perfiles for select using (id = auth.uid());
drop policy if exists "perfil propio: editar" on public.perfiles;
create policy "perfil propio: editar" on public.perfiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "catálogo: colecciones" on public.colecciones_tcg;
create policy "catálogo: colecciones" on public.colecciones_tcg for select using (true);
drop policy if exists "catálogo: cartas" on public.cartas;
create policy "catálogo: cartas" on public.cartas for select using (true);
drop policy if exists "precios: ver" on public.precios;
create policy "precios: ver" on public.precios for select using (true);
drop policy if exists "ajustes: ver" on public.ajustes_globales;
create policy "ajustes: ver" on public.ajustes_globales for select using (true);

drop policy if exists "cajas propias" on public.cajas;
create policy "cajas propias" on public.cajas for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists "entradas propias" on public.entradas;
create policy "entradas propias" on public.entradas for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists "albumes propios" on public.albumes;
create policy "albumes propios" on public.albumes for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists "casillas de mis albumes" on public.album_casillas;
create policy "casillas de mis albumes" on public.album_casillas for all
  using (exists (select 1 from public.albumes a where a.id = album_id and a.usuario_id = auth.uid()))
  with check (exists (select 1 from public.albumes a where a.id = album_id and a.usuario_id = auth.uid()));

grant select on public.perfiles_publicos to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Tiempo real: los cambios de la colección llegan al instante a todos los dispositivos
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cajas; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.entradas; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.albumes; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.album_casillas; exception when duplicate_object then null; end;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Utilidades
-- ----------------------------------------------------------------------------
-- ¿El usuario actual es administrador?
create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

-- Valor de la colección del usuario actual (suma de precio unitario × cantidad) se calcula en la
-- app con los precios en caché; aquí solo un resumen rápido de cantidades.
create or replace function public.resumen_coleccion()
returns table (cartas bigint, entradas bigint, cajas bigint, albumes bigint)
language sql
security invoker
stable
as $$
  select
    coalesce((select sum(cantidad) from public.entradas where usuario_id = auth.uid()), 0),
    (select count(*) from public.entradas where usuario_id = auth.uid()),
    (select count(*) from public.cajas where usuario_id = auth.uid()),
    (select count(*) from public.albumes where usuario_id = auth.uid());
$$;
