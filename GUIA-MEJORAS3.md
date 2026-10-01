# PokéTCG v2 · Mejoras 3 — Guía corta (portadas, fondo de la app y agregar rápido)

Publicado en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`). Todo lo anterior sigue igual (compras, pagos, tiendas, publicaciones, reglas de álbum y Bulk).

## 1. Lo que tienes que hacer tú (una sola vez)

**Supabase → SQL Editor → New query → pega completo `supabase/0008_mejoras3.sql`** (copia en `D:\POKEMON APP\v2\supabase\`) → **Run** → "Success". Añade a los álbumes personalizados el **color** y la **marca de agua**, y al perfil el **fondo de la app** y su **intensidad**. Es idempotente y no borra nada. Mientras no esté pegado, la app funciona igual pero esas elecciones no se guardan en la base (el fondo se recuerda solo en ese dispositivo; los álbumes quedan azules con el emblema). Nada en Vercel ni en GoDaddy.

## 2. Bloque A · Portadas de los álbumes

- **Álbumes de colección**: portada con el **logo oficial** de la colección (TCGdex; si no, pokemontcg.io) en una cajita blanca centrada sobre un color suave fijo por colección. Mientras carga, o si no hay logo (colecciones japonesas), se ve el símbolo y el nombre. Ya no se usa una carta recortada.
- **Álbumes personalizados**: portada del color elegido con el **emblema PokéTCG** (carpeta con anillas y estrella, dibujo propio: sin Pokébola ni siluetas) como marca de agua y el nombre encima. Los que ya tenías quedan azules con el emblema.
- **Nuevo álbum / Editar** (botón "Editar" dentro del álbum): vista previa en vivo, nombre, **8 colores** (`#E2571E`, `#1F5FCC`, `#1E8A57`, `#7C4DDB`, `#C99A00`, `#D23B30`, `#1C2340`, `#0E7C86`), marca de agua (**Emblema PokéTCG · Llamas · Olas · Hojas · Rayos · Estrellas · Ninguna**) y páginas / columnas / filas como hoy.
- El nombre siempre se lee (contraste ≥ 4.5:1): sobre dorado va en oscuro; sobre naranja o verde lleva un sombreado suave al pie.

## 3. Bloque B · Fondo de la app

- **Ajustes → Apariencia → Fondo de la app**: **Liso · Llamas · Olas · Hojas · Rayos · Estrellas · Aleatorio** con vista previa. Aleatorio cambia cada día (y dice cuál toca hoy).
- Son dibujos propios en trazo, en mosaico inclinado 12°, como marca de agua detrás de todas las pantallas; las tarjetas y botones no cambian. Es un solo SVG fijo (no afecta el desplazamiento).
- **Intensidad** 0–100 % (40 % por defecto ≈ 8 % de opacidad; 0 % lo apaga). Por defecto **Hojas**.
- Se guarda en tu perfil: se mantiene entre el celular y la PC. En modo oscuro el patrón sale en un tono claro con la misma opacidad.

## 4. Bloque C · Agregar rápido desde el álbum

- En la hoja del álbum, cada **casilla gris** (carta que falta) tiene un botón **+** azul (48 px). Tocar la casilla fuera del + sigue abriendo la carta y el mercado.
- El + abre una ventana (hoja inferior en el celular, ventana centrada en PC) **ya completada**: carta y casilla, **idioma del álbum** ("Inglés · del álbum"), **estado NM**. Solo pregunta el **acabado**: **Normal · Holo · Reverse Holo · Otro…** (Otro abre la lista completa). Viene preseleccionado el acabado más común de esa carta (según los precios/catálogo) o, si ya elegiste uno en esta sesión de carga, el último que usaste.
- **Cantidad** con − / +. Con más de 1: una va a la casilla y el resto al Bulk sugerido (reglas de Mejoras 2), con el aviso "Más de 1: una va al álbum y el resto a Bulk X".
- **"Cambiar idioma o estado"** para casos especiales.
- **Guardar** guarda y cierra; la casilla pasa a color en el acto. **Guardar y siguiente (N)** guarda y abre la siguiente casilla vacía (cambia de página si hace falta). Nunca sales del álbum; al cerrar sigues en la misma página.
- **PC**: **Enter** = guardar y siguiente, **Esc** = cerrar, **1–4** = acabado.
- Si la casilla ya se llenó desde otro dispositivo mientras tanto, la ventana avisa y la copia va al Bulk como repetida.
- Publicaciones, precios y "Bulk en venta" siguen las mismas reglas que al agregar desde el buscador.

## 5. Pruebas

`npm test`: 71 pruebas (lógica, portadas y patrones, cuadrícula, base de datos). E2E (`node test/e2e.mjs`): 80 pasos en verde, incluidos portadas (con respaldo sin internet y sin las columnas 0008), fondo (perfil, Aleatorio, oscuro, respaldo local) y agregar rápido (celular, PC con teclas, casilla ocupada).
