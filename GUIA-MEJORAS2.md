# PokéTCG v2 · Mejoras 2 — Guía corta (imágenes, álbum primero, Bulk aparte, vender álbumes, Mazos)

Publicado en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`). Todo lo anterior (compras, pagos, tiendas, saldo, reclamos, reportes, escáner, importación) sigue igual.

## 1. Lo que tienes que hacer tú

1. **Supabase → SQL Editor → New query** → pega **completo** `supabase/0006_mejoras2.sql` (copia en `D:\POKEMON APP\v2\supabase\`) → **Run** → "Success". Se puede pegar las veces que quieras; no borra nada. Trae tres funciones: separar copias de una carta (álbum ↔ Bulk), "Ordenar repetidas" y "Llenar álbumes desde Bulk". Sin esto, esos asistentes dan error; el resto de la app funciona igual.
2. Nada en Vercel ni en GoDaddy. No hace falta volver a copiar el catálogo a la base desde /admin (solo cambiaron las imágenes).
3. Si algún día quieres volver a comprobar las imágenes (por si TCGdex o Limitless suben las que faltan): GitHub → pestaña **Actions** → **"Imágenes del catálogo"** → **Run workflow**. Tarda unos 20 minutos y publica solo el catálogo nuevo.

## 2. Bloque A · Imágenes reales en los álbumes

- **Por qué salía "sin foto":** la app pedía todas las imágenes a TCGdex, y TCGdex no tiene las de varias colecciones japonesas (promos SV-P y Mega, toda la era Mega, las anteriores a 2011). El respaldo (Limitless) fallaba en todas las cartas menores de 100 por un cero de más en el número. Y la caché guardaba también los errores: una carta que falló una vez quedaba "sin foto" para siempre en ese aparato.
- **Ahora:** el catálogo sabe dónde está cada imagen (TCGdex en inglés/español/japonés, pokemontcg.io o Limitless) y la pide a la primera. Álbum en español → imagen en español si existe, si no en inglés. Las casillas que te faltan muestran la carta **en gris más claro**; las tuyas a color. Al abrir una carta se carga la imagen grande. La página siguiente del álbum se precarga sola. La caché solo guarda imágenes que cargaron de verdad.
- Si de verdad no existe la imagen en ninguna fuente pública: **casilla gris con nombre, número y colección**. Nunca "sin foto".
- `tools/validar-imagenes.mjs` + `tools/informe-imagenes.txt` (copia en `D:\POKEMON APP\v2\informe-imagenes.txt`): **97,5 %** con imagen en las colecciones con alguna fuente pública (31.482 de 32.300). Lo que no se consigue hoy: 26 colecciones japonesas de 1996–2006 (2.187 cartas, ninguna fuente pública las tiene); secretas japonesas de la era SM/S por encima del número impreso (p. ej. S8 116–129); 30th CELEBRATION 104+; Mega Promo 052/077+; McDonald's 2013–2018, FR, 2023, 2024; trainer kits; My First Battle; Unown; Celebrations Classic; MEP 093/102+; Aquapolis 50a/b… En las colecciones que tú coleccionas (SV, Mega, 151, Prismatic…) está todo.

## 3. Bloque B · El álbum es lo principal; el Bulk guarda las repetidas

- **Regla:** cada casilla de álbum guarda **1 copia**. Las demás copias de la misma carta (misma colección e idioma) son **repetidas** y van al Bulk con su posición.
- **Al guardar una carta** (Buscar, Escanear, Agregar carta, Carta recibida):
  - casilla vacía → se sugiere esa casilla; si aún no tienes ese álbum: **"Crear álbum de [colección] en [idioma]"** (un toque; el álbum nace con esa carta).
  - casilla ocupada → **"Repetida · Mandar a Bulk X · posición #n"** (o **"Crear un Bulk"** si no tienes ninguno).
  - debajo salen alternativas (otro álbum, mismo álbum en otro idioma con aviso, Bulk). Siempre eliges tú.
  - si guardas varias copias en el álbum: **1 a la casilla y el resto al Bulk** que elijas (lo ves antes de guardar). Igual con las compras que llegan en varias copias.
- **"Ordenar repetidas"**: al abrir Álbumes, si alguna casilla tiene más de 1 copia, aparece *"Tienes N cartas repetidas en tus álbumes. ¿Las mandamos a Bulk?"* → eliges o creas un Bulk → resumen (cuántas, a qué Bulk, posiciones) → confirmas. También dentro de cada álbum ("Ordenar repetidas (N)"). "Ahora no" lo oculta hasta que cambie el número.
- **"Llenar álbumes desde Bulk"**: aviso *"N cartas de tu Bulk pueden ir a tus álbumes"* → lista por álbum con casillas (puedes desmarcar o marcar álbumes enteros) → **Mover**. Con varias copias, solo 1 va al álbum. También dentro de cada álbum ("Traer del Bulk (N)").
- **Publicaciones:** si una carta publicada cambia de lugar, la publicación se mantiene (sigue a las copias que salen al Bulk). Las que tienen una reserva de un comprador no se tocan.
- Hoja del álbum: **×N en ámbar** solo si la casilla tiene repetidas; **+N** gris = copias en Bulk.
- Sin ningún Bulk: la sección Bulk explica para qué sirve y tiene **Crear mi primer Bulk**.
- Nada se mueve solo: solo con los asistentes y tu confirmación.

## 4. Bloque C · Poner en venta un álbum

Al tocar **Poner en venta… (N)** en un álbum: **"¿Con qué cartas te quieres quedar?"**
1. **Quedarme con 1 de cada carta** (recomendado): se venden solo las repetidas (5 Pinsir → 1 se queda, 4 salen). Cuenta las copias de esa colección e idioma que tengas en álbum y en Bulk; la que se queda es la de la casilla.
2. **Quedarme con las de mayor precio**: "las que valen más de S/ X" (deslizador o número) o "las N más caras"; esas no se publican. Combinable con la 1.
3. **Elegir una por una**: lista marcada según las reglas; desmarca las que no vendes.
4. **Vender todo**.

Antes de confirmar, el **resumen**: copias que se publican, copias que te quedas, precio estimado y cuántas necesitarán foto (más de S/ 50). Las que se quedan no se tocan; las publicadas salen con el precio por defecto y la regla de la foto. Las repetidas que se venden se ven en la casilla con el icono de venta y el número, y en la ficha de la carta como **"N para vender"** (en el álbum, para vender) hasta que se vendan o las mandes a Bulk.

## 5. Bloque D · Mazos en Mi Colección

- **Mi Colección**: Álbumes · Bulk · **Mazos** · Buscar / Escanear · Mis ventas (chips en el celular, menú lateral en PC). **Mercado**: Inicio · Carrito · Mis compras.
- Las direcciones `/app/mazos` y `/app/mazos/<id>` siguen igual; "Comprar faltantes" sigue llevando al carrito.

## 6. Pruebas

`npm test`: 64 pruebas (lógica + base de datos). E2E (`node test/e2e.mjs`): 70 pasos en verde, incluidos los nuevos de imágenes, repetidas, llenar álbumes, venta del álbum y Mazos.
