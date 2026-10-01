# PokéTCG v2 · Ajustes de layout 1 y 2 — Guía corta

Publicado en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`). Solo navegación y diseño: las reglas de negocio, los pagos y la base de datos siguen igual (salvo el punto 1 de abajo, que repone en producción cosas que faltaban).

## 1. Lo que tienes que hacer tú (una sola vez)

**Supabase → SQL Editor → New query → pega completo `supabase/0007_ajustes_layout.sql`** (copia en `D:\POKEMON APP\v2\supabase\`) → **Run** → "Success". Ya lo hiciste el 1 de octubre; si algún día dudas, se puede volver a pegar: es idempotente y no borra nada.

¿Por qué hacía falta? Al revisar producción descubrí que **faltaban partes de migraciones anteriores**: se añadieron a los archivos 0003, 0004 y 0005 después de que los pegaras, y nunca te pedí volver a pegarlos. Sin ellas fallaban en poketcg.pe: *marcar una orden como entregada*, las *devoluciones*, la lista de deseos, las tiendas y cifras públicas de la portada, el historial de ventas por carta y los carruseles del Mercado. El 0007 trae todo eso (copia literal de los archivos originales, en el orden correcto). Nada en Vercel ni en GoDaddy.

## 2. Ajustes de layout 1 (diferencias con las maquetas)

1. **Carruseles del Mercado**: "Mayor precio" lista las publicaciones activas más caras; "Más vendidas" usa las ventas de 30 días y, si no hay, se completa con las más publicadas / más deseadas y el subtítulo dice "sin ventas en 30 días: las más publicadas". El mensaje vacío solo sale sin ninguna publicación activa. Si la función de la base falta, la app arma los carruseles por su cuenta.
2. **Lupa** de los buscadores sin montarse sobre el texto (barra superior de PC, Mercado en celular, Bulk, colección).
3. **Portadas de los álbumes**: recorte desde arriba, se ve la ilustración y no el texto de ataques.
4. **Casillas que faltan**: gris claro sobre la hoja oscura (también en modo oscuro), con "En mercado · S/ X" / "Sin stock" legibles.
5. **Número de casilla** abajo a la izquierda, pequeño y translúcido; el contador (+3, ×2) arriba a la derecha y la etiqueta de venta arriba a la izquierda.
6. **Bulk en PC** con el menú lateral de Mi Colección (también dentro de cada Bulk) y miniaturas con imagen.
7. **Pestaña activa en la ficha de una carta**: Mercado si llegas desde el Mercado (carruseles, resultados, carrito), Mi Colección si llegas desde un álbum o Bulk.
8. **Modo claro por defecto** aunque el sistema esté en oscuro. Ajustes → Apariencia: **Claro** (por defecto) · **Oscuro** · **Automático**. Se guarda por usuario en cada dispositivo (no en la base).

## 3. Ajustes de layout 2 (secciones, carrito y vista del álbum)

1. **Sin sección "Buscar / Escanear"**. El buscador hace ese trabajo:
   - PC: el buscador de la barra superior busca en tu colección (en Mi Colección) o en el mercado (en Mercado) y tiene dentro el **botón de cámara** (abre el escáner).
   - Celular: el mismo buscador con cámara está debajo del precio de la colección en Mi Colección (como en el Mercado).
   - Los resultados dicen **dónde tienes cada carta** ("×3 · Bulk 1 #2 de 3", "Álbum 151 EN · 025" o "Todavía no la tienes") con botones **Agregar** y **Ver en el mercado**.
   - `/app/buscar` y `/app/escanear` siguen existiendo como pantallas (con "← Mi Colección" en el celular).
2. **Secciones**: **Mi Colección** = Álbumes · Bulk · Mazos. **Mercado** = Inicio · Mis compras · **Mis ventas** (chips en celular y en PC; al abrir Mis ventas se marca la pestaña Mercado; el chip lleva la insignia de órdenes por entregar).
3. **Carrito una sola vez**: solo el botón amarillo con el número, arriba a la derecha. `/app/carrito` sigue igual (en el celular se abre con "← Mercado").
4. **Vista del álbum**:
   - **Selector de cuadrícula** junto a Todas / Tengo / Faltan: PC **3×3 · 3×4 · 4×4 · 4×5 · 4×6** y **1 página / 2 páginas** lado a lado (con 2 páginas, hasta 4×4); celular **3×3 · 3×4 · 4×5**. Por defecto PC 4×5 en 1 página, celular 3×3. Se recuerda por usuario en el dispositivo y por álbum (un álbum nuevo arranca con tu última elección).
   - En PC la hoja se dimensiona para que **una página completa entre en la ventana sin bajar**; el panel derecho mide 280 px y en pantallas de menos de 1280 px pasa debajo. "Mis álbumes" va en la fila del título. "Ir a página" se adapta ("11 páginas de 20").
   - Ojo: una página 4×5 es más alta que ancha. En 1280×800 las casillas quedan de ~75 px para que entre completa; con **2 páginas en 4×4**, 3×3 o 3×4 las casillas salen más grandes y llenan el ancho.
5. **Flechas a los costados** de la hoja (56 px, centradas en vertical, desactivadas en la primera/última página), "Página X de Y" pequeño arriba. PC: también con **← →** del teclado (no cuando escribes en un campo ni con una hoja abierta). Celular: también **deslizando** con el dedo sobre la hoja.

## 4. Capturas

`D:\POKEMON APP\v2\capturas-layout\` tiene las pantallas actualizadas (celular 390×844 y PC 1280×800) tomadas con `node test/capturas.mjs` sobre el entorno de pruebas.

## 5. Pruebas

`npm test`: 67 pruebas (lógica, cuadrícula del álbum y base de datos). E2E (`node test/e2e.mjs`): 76 pasos en verde, incluidos los nuevos de buscador con cámara, secciones, carrito, cuadrícula, flechas, teclado y deslizar.
