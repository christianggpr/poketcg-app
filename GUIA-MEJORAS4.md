# PokéTCG v2 · Mejoras 4 — Guía corta (álbum grande, álbumes propios como libro, Pokédex, filtros y búsqueda)

Publicado en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`). Todo lo anterior sigue igual (compras, pagos, tiendas, publicaciones, reglas de álbum y Bulk).

## 1. Lo que tienes que hacer tú (una sola vez)

**Supabase → SQL Editor → New query → pega completo `supabase/0009_mejoras4.sql`** (copia en `D:\POKEMON APP\v2\supabase\`) → **Run** → "Success". Crea la tabla de la Pokédex (`pokedex_elecciones`: la carta elegida por casilla), la opción de ocultar la Pokédex en el perfil y la nueva versión de la función `mercado_resumen` con los filtros y órdenes nuevos del Mercado. Es idempotente y no borra nada. **No hay que activar ninguna extensión** (la búsqueda tolerante a errores se hace en el navegador con el catálogo). Nada en Vercel ni en GoDaddy.

Mientras no esté pegado: la Pokédex funciona, pero "Elegir otra carta" y "Ocultar" se recuerdan solo en ese dispositivo; en el Mercado, los filtros por foto real y reputación y los órdenes "Más vendidas" y "Nombre" muestran un aviso y se ignoran (los demás filtros sí funcionan).

## 2. Bloque A · La carpeta ocupa casi toda la pantalla

- Un solo componente "libro" para los álbumes de colección, los personalizados y la Pokédex.
- **Una fila de herramientas**: título, fila compacta "48 / 124 · 39 % · S/ 83.00", filtros (Todas · Tengo · Faltan), cuadrícula (3×3 · 3×4 · 4×4 · 4×5 · 4×6; en el celular 3×3 · 3×4 · 4×5), **1 o 2 páginas** (PC), menú **Acciones** (Agregar carta, Comprar faltantes, Poner en venta, Ordenar repetidas, Traer del Bulk, Precio de las que faltan) y **pantalla completa** (solo la carpeta; el mismo botón o Esc vuelve).
- "Página X de Y" con el selector **Ir a** al lado. Flechas pegadas a los costados de la carpeta; teclado ← → en PC; deslizar en el celular.
- La hoja se calcula con el **alto y el ancho disponibles**: una página completa siempre entra sin bajar (PC y celular en horizontal). En el celular en vertical usa todo el ancho. Como una página de 4×5 es "alta", en PC la limita el alto de la ventana; con 2 páginas (hasta 4×4) la carpeta ocupa casi todo el ancho.
- El **+** de las casillas que faltan es discreto: círculo de 40 px (36 en cuadrículas pequeñas), azul al 35 % con borde fino y fondo desenfocado; sólido al pasar el mouse o con el teclado. La carta gris sigue siendo lo principal.
- El icono **ⓘ** junto al título explica cómo se usa (en vez de frases largas en la pantalla).

## 3. Bloque B · Álbumes personalizados como libro

- Misma hoja oscura, flechas, "Ir a", pantalla completa y menú Acciones (**Rellenar con una colección · Editar álbum · Eliminar álbum**).
- La **cuadrícula propia** del álbum (las columnas × filas con las que lo creaste, p. ej. 3×3 o 4×3) aparece como opción y es la que se usa al entrar; puedes ver el mismo álbum en otra cuadrícula.
- **+** en los bolsillos vacíos (abre el buscador para asignar una carta). Un bolsillo lleno abre su menú (ya la tengo, ver la carta, mover, cambiar, vaciar). En PC se puede **arrastrar** una carta a otro bolsillo.
- Fila compacta: "tengo / asignadas · S/ precio de lo que tienes · faltan S/ para completar".
- Al **crear** un álbum se abre ya como libro.

## 4. Bloque C · Pokédex

- Álbum fijo **Pokédex**, el primero de la lista (portada roja con el emblema). Una casilla por especie, **0001 → 1025 en orden nacional**.
- Una casilla está "tengo" si tienes **cualquier carta de esa especie** (cualquier colección, idioma o acabado): muestra tu **carta más valiosa** (precio por defecto) con ×N copias. Toca la casilla → "Elegir otra carta para esta casilla" (lista tus copias de esa especie, con su ubicación y precio) y "Volver a la más valiosa".
- Las que faltan: en gris, la carta más reciente del catálogo de esa especie y el n.º de Pokédex; al tocarla, "Buscar en el mercado".
- Filtros: **generación 1–9** (Kanto … Paldea), **tipo** y Todas / Tengo / Faltan. Fila compacta "tengo / 1025 · % · S/".
- Es **virtual**: no mueve nada de lugar. No se puede borrar, pero sí **ocultar** (Acciones); en Mis álbumes aparece "Mostrar la Pokédex" para recuperarla.

## 5. Bloque D · Filtros y búsqueda en el Mercado

- **PC**: panel de filtros al costado izquierdo (se pliega con la flecha y se recuerda). **Celular**: botón **Filtros · N** que abre una hoja con los mismos filtros y "Ver resultados".
- Filtros: **Colección** (con buscador dentro), **Tipo**, **Ilustrador** (con buscador), **Rareza**, **Idioma**, **Acabado**, **Estado**, **Precio** (deslizador mín.–máx. hasta S/ 500 y campos para escribir cualquier cifra), **Con foto real**, **Vendedor con buena reputación** (sin alertas, 3 ventas o más y 4 estrellas o más). Sigue "Solo las que me faltan".
- Los filtros activos se ven como **chips quitables** arriba de los resultados, con "Limpiar todo", y quedan en la **dirección** (`/app/mercado/buscar?coleccion=sv03.5&tipo=Grass&min=5&orden=precio`) para compartir o volver.
- Orden: **Más nuevas · Menor precio · Mayor precio · Más vendidas (90 días) · Nombre**.
- **Búsqueda tolerante a errores** en el navegador, sin pg_trgm: sugerencias mientras escribes (nombre en ES/EN/JP, colección, ilustrador: tocar una colección o un ilustrador aplica ese filtro), "**¿Quisiste decir Charizard?**" cuando una palabra parece mal escrita ("charisard", "pikachuu", "evee" → Eevee), y se ignoran tildes, mayúsculas y guiones ("ho oh" = "ho-oh" = "hooh"). También en los buscadores de la barra superior (PC) y del inicio del Mercado y de Mi Colección (celular).

## 6. Bloque E · Filtros y búsqueda en Mi Colección y en el Bulk

- **Buscar en mi colección**: el mismo botón **Filtros** con los mismos filtros, más **Dónde** (cualquiera · en álbum · en Bulk) y **En venta / No en venta**. "¿Quisiste decir…?" y sugerencias igual que en el Mercado.
- La búsqueda es **general**: toda tu colección (álbumes y Bulk) y el catálogo completo, agrupada en **En tu colección** (cada carta con dónde está cada copia: álbum y casilla, o Bulk y posición) y **Otras cartas** (del catálogo, con Agregar y Ver en el mercado). Con solo filtros (sin texto) lista tus cartas que los cumplen.
- **Bulk**: botón **Filtros · N** (colección, tipo, ilustrador, rareza, idioma, acabado, estado, precio, en venta / no) junto al buscador, chips quitables y orden **Posición · Nombre · Colección · Precio**. En PC y en el celular igual (hoja de filtros).

## 7. Bloque F · Textos cortos

- Rótulos, botones y títulos de ~5 palabras como máximo ("cartas · 4 distintas", "precio estimado", "Bulks", "falta foto", "se publican solas"…). Las explicaciones largas (Mercado, Por colocar, cómo se usa cada álbum) van detrás del icono **ⓘ Ayuda**.
- El E2E recorre 20 pantallas en **360, 768, 1024 y 1280 px** y falla si algún rótulo, botón o título se parte en 3 líneas, se corta o desborda (o si la página tiene desplazamiento horizontal).

## 8. Pruebas

`npm test`: 85 pruebas (lógica, portadas y patrones, cuadrícula propia, Pokédex, filtros y búsqueda tolerante, base de datos). E2E (`node test/e2e.mjs`): 85 pasos en verde, incluidos el libro en PC 1280×800 y 1920×1080 (todas las cuadrículas, 1 y 2 páginas, pantalla completa), álbum propio como libro, Pokédex, filtros del Mercado (celular y PC), búsqueda general de Mi Colección, filtros del Bulk y la revisión de textos.
