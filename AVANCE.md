# AVANCE · PokéTCG v2 — Mejoras 5

Última actualización: 2 de octubre de 2026. Copia en `D:\POKEMON APP\v2\AVANCE.md` y en el repositorio.

## Estado

- **Mejoras 5 · bloque A (errores de álbumes): listo** y publicado.
- **Mejoras 5 · bloque B (tipos de álbum al crear): listo** y publicado.
- **Mejoras 5 · bloque C (buscador y filtros a la izquierda): listo** y publicado.
- **Mejoras 5 · bloque D (barra superior con secciones): listo** y publicado en https://poketcg.pe (rama `main`).
- **Mejoras 5 está completo.** La guía corta está en `D:\POKEMON APP\v2\GUIA-MEJORAS5.md` (y en el repositorio). No hay siguiente bloque: pruébalo en celular y PC y dime qué ajustar.

## Lo que tienes que hacer tú (bloque D)

- **Nada**: este bloque no toca la base de datos. Nada en Vercel ni en GoDaddy.
- Si todavía no pegaste los SQL de los bloques anteriores, pégalos en orden: `0009_mejoras4.sql`, `0010_mejoras5.sql`, `0011_mejoras5b.sql` (Supabase → SQL Editor → New query → pegar → Run; se pueden pegar varias veces). Está explicado en la guía.

## Qué cambió en el bloque D

- **Barra superior de PC** (maquetas M5-PC-*): logo · Mi Colección / Mercado · **secciones como pestañas con subrayado azul** · carrito amarillo · perfil. Mi Colección → Álbumes · Bulk · Mazos; Mercado → Explorar · Mis compras · Mis ventas · Mi tienda. Entre 1024 y 1279 px los nombres se acortan (Compras · Ventas · Tienda) y los accesos Tienda/Admin de la derecha se guardan en el menú del avatar hasta 1180 px.
- **Se quitó el buscador de la barra**: está en la columna izquierda de cada pantalla (bloque C). Se quitó el **menú lateral viejo** de secciones; en la columna de Mi Colección queda el precio arriba del buscador y los filtros.
- **Mi tienda** = tu página pública `/u/tu_usuario` (cartas en venta, reputación y reseñas, como te ven los compradores). Solo aparece si tienes **cartas en venta** (publicaciones activas): si pausas o retiras todas, desaparece sola.
- **Explorar es el inicio del Mercado** (`/app/mercado`): sin búsqueda ni filtros muestra arriba los destacados ("Más vendidas" y "Mayor precio", más compactos, lado a lado en PC) y debajo la cuadrícula con todo lo que está en venta (más nuevas primero), que reemplaza a "Recién publicadas". La dirección antigua `/app/mercado/buscar` redirige.
- **Celular**: las secciones siguen como chips arriba del contenido (Explorar · Compras · Ventas · Tienda / Álbumes · Bulk · Mazos); abajo, las dos pestañas principales. En Explorar hay un solo buscador (el de la fila con "Filtros").
- Pruebas: `npm test` 93; E2E 97 pasos (nuevo bloque D: secciones en la barra, subrayado, orden de la barra, Mi tienda que aparece y desaparece, 1024 px sin desbordar, chips del celular, destacados que se van al buscar, redirección).

## Pendiente / a medias

- Nada a medias. Si prefieres Explorar **sin** los destacados arriba (como en la maqueta), dímelo y los quito o los dejo plegados.
