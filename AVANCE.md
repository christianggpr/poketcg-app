# AVANCE · PokéTCG v2 — Mejoras 5

Última actualización: 2 de octubre de 2026. Copia en `D:\POKEMON APP\v2\AVANCE.md` y en el repositorio.

## Estado

- **Mejoras 5 · bloque A (errores de álbumes): listo** y publicado.
- **Mejoras 5 · bloque B (tipos de álbum al crear): listo** y publicado.
- **Mejoras 5 · bloque C (buscador y filtros a la izquierda): listo** y publicado en https://poketcg.pe (rama `main`).
- **Siguiente bloque: D** (barra superior de PC con las secciones como pestañas subrayadas y sin buscador; "Mi tienda" solo con stock en venta; quitar el menú lateral viejo). No empieza hasta que digas "sigue". Al terminar D va la guía `GUIA-MEJORAS5.md`.

## Lo que tienes que hacer tú (bloque C)

- **Nada**: este bloque no toca la base de datos (no hay SQL nuevo). Nada en Vercel ni en GoDaddy.
- Si todavía no pegaste los SQL de los bloques anteriores, pégalos en orden: `0009_mejoras4.sql`, `0010_mejoras5.sql`, `0011_mejoras5b.sql` (Supabase → SQL Editor → New query → pegar → Run; se pueden pegar varias veces).

## Qué cambió en el bloque C

- **Mercado → Explorar en PC** (`/app/mercado/buscar`, maqueta M5-PC-Mercado): dos columnas. Izquierda (~270 px): buscador con botón de cámara, "¿Quisiste decir…?" y la tarjeta **Filtros** (Precio, Idioma, Colección, Tipo, Ilustrador, Rareza, Acabado, **Estado en botones** NM/LP/MP/HP/DM, **Punto de entrega**, Solo con foto real, Vendedor con buena reputación), botón **Aplicar filtros** (los cambios quedan en borrador hasta pulsarlo) y **Limpiar**. Derecha: título **Explorar**, "[N] cartas en venta · página X de Y", **Ordenar**, botones cuadrícula/lista, chips de filtros quitables, **cuadrícula de 5 cartas por fila** (4 a 1280 px) con imagen, colección y número, nombre, copias y vendedor, precio más bajo, "Mercado: S/ X" y **corazón** de favorito; paginación de 40 en 40. La columna se puede **plegar** (flecha) y se recuerda.
- **Punto de entrega**: no filtra el mercado (cualquier vendedor entrega en cualquier tienda aliada): es la tienda donde prefieres recoger; se recuerda en tu dispositivo y el carrito la deja elegida.
- **Mi Colección en PC** (maqueta M5-PC-Coleccion): la columna izquierda ahora es precio de mi colección · menú (Álbumes · Bulk · Mazos, hasta el bloque D) · **buscador con cámara** · tarjeta **Filtros** (Dónde Todo/Álbumes/Bulk en botones, Colección, Tipo, Ilustrador, Rareza, Idioma y Acabado, Estado en botones, Precio, En venta Todas/Sí/No). Sin búsqueda se ve la sección elegida; al escribir o tocar un filtro, a la derecha salen los resultados **"Resultados para «…»"** con "N tuyas · M del catálogo", **En tu colección** (con ubicación) y **Otras cartas**. Los chips y la tarjeta van sincronizados. El Bulk conserva sus propios filtros (los de dentro de cada Bulk).
- **Celular** (maqueta M5-Mercado): el buscador (con cámara dentro) y el botón **"Filtros · N"** van en la misma fila; el botón abre la hoja con **Limpiar** arriba y **"Ver N cartas"** abajo; Explorar se ve en cuadrícula de 2 (o lista).
- Todo (texto, filtros, orden, vista y página) queda en la dirección de la página para compartir o volver.
- Pruebas: `npm test` 93; E2E 96 pasos (nuevos: C1 PC Explorar, C2 PC Mi Colección, C3 celular; los de Mejoras 4 adaptados a los botones de Estado/Dónde/En venta y a "Ver N cartas").

## Pendiente / a medias

- Nada a medias del bloque C.
- El buscador de la barra superior de PC sigue hasta el bloque D (ahí se quita y las secciones pasan arriba, como en las maquetas).
- Bloque D no debería necesitar SQL (te lo confirmo al terminarlo).
