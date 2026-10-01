# PokéTCG v2 · Mejoras 1 — Guía corta (navegación, álbumes, Bulk, mercado y arreglos)

Publicado en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`). Todo lo de las Fases 1–4 sigue funcionando.

## 1. Lo que tienes que hacer tú

1. **Supabase → SQL Editor** → pega **completo** `supabase/0005_mejoras1.sql` (copia en `D:\POKEMON APP\v2\supabase\`) → **Run**. Se puede pegar las veces que quieras; no borra nada. Trae: la columna para guardar cartas en álbumes, el cambio de nombre «Caja N» → «Bulk N», los textos nuevos de dos avisos y la función de los destacados del Mercado.
2. Nada en Vercel ni en GoDaddy.
3. (Pendiente de ti) **A1**: cuéntame qué ves exactamente al bajar, en qué página y en qué dispositivo (o una captura) para dar con la causa; no pude reproducirlo ni en tu navegador ni con Playwright en PC y celular.

## 2. Bloque A · Arreglos

- **A2 · Mazos del meta.** Causa: Limitless repite la misma lista cuando un jugador la usa en dos torneos; al guardar un arquetipo con una lista repetida la base rechazaba la grabación completa («ON CONFLICT … cannot affect row a second time») y la carga se detenía en el primer arquetipo. Arreglo: las listas y arquetipos repetidos se descartan (se conserva el mejor puesto) y un arquetipo con error ya no detiene a los demás (queda anotado en /admin). Además, la tarea nocturna **se vuelve a llamar sola en cadena** (máximo 30 min) hasta terminar, así la carga completa acaba la misma noche aunque Vercel Hobby solo dispare el cron una vez al día; la primera visita del día también la despierta. Elegí esto porque es gratis y no necesita nada en Supabase ni en Vercel. Botón **/admin → 📈 Precios y tareas → «🃏 Actualizar mazos ahora»** con progreso (arquetipo X de N) y errores. Resultado en producción: 20 arquetipos, 84 variantes, 160 listas de 60.
- **A3 · Tipo de cambio.** Se renueva cada día a las 00:00 de Lima aunque no haya precios que renovar. /admin muestra el vigente con **fecha y hora (Lima) y fuente**, el último intento fallido (si lo hubo) y una **alerta roja si pasan más de 48 h** sin actualizarse.
- **A1 · Desplazamiento.** Hay una prueba E2E que baja hasta el final de 17 páginas (PC 1280 px, celular 390 y 360 px), abre y cierra una hoja y comprueba que se puede seguir desplazando y que no hay desbordes. Falta tu descripción del error para cerrarlo.

## 3. Bloque B · Navegación

- Dos pestañas principales: **📚 Mi Colección** (abre en Álbumes; secciones Álbumes · Bulk · Buscar / Escanear · Mis ventas) y **🛒 Mercado** (Inicio · Buscar en el mercado · Mazos · Carrito · Mis compras). Barra inferior en el celular, pestañas arriba en la PC.
- **Ajustes, notificaciones, centro de ayuda, admin/tienda y cerrar sesión** en el círculo con tu inicial (arriba a la derecha). El chip 🛒 del carrito se mantiene.
- Direcciones antiguas: `/app` → Álbumes, `/app/cajas` → `/app/bulk`, `/app/cajas/<id>` → `/app/bulk/<id>`, `/app/mercado?set=…` → Buscar en el mercado. Los correos y enlaces ya enviados siguen funcionando.

## 4. Bloque C · Mi Colección

- **C1 · Bulk.** «Caja» se llama «Bulk» en toda la app, ayuda, portada, avisos y Excel («Bulk en venta», «Bulk 2 #37»). Los Bulks con nombre por defecto «Caja N» se renombran «Bulk N» al pegar el SQL; los nombres propios no se tocan.
- **C2 · Por llegar y Recibidas.** Álbumes abre con **📦 Por llegar** (compras pagadas que aún no recibes: pago en revisión, por entregar, en tienda, en reclamo, con la fecha estimada) y **📥 Recibidas: ¿dónde las guardas?** (compras entregadas sin lugar) con botones **Guardar en [sugerido] / Elegir otro álbum / Guardar en Bulk**; al tocar queda guardada y se muestra su casilla o posición.
- **C3 · Sugerencia.** La app mira cómo coleccionas, en este orden: (1) álbum de la misma colección y en ese idioma → la casilla de su número; (2) álbum personalizado cuyas cartas son mayormente del mismo Pokémon o línea (o del mismo ilustrador, rareza o tipo, si ese es el patrón claro) → su bolsillo libre; (3) álbum de la misma colección en otro idioma (avisa que el idioma no coincide); (4) Bulk: el último usado, con la posición que le tocaría. Siempre con el motivo en una línea. La misma sugerencia aparece al guardar desde Buscar/Escanear (botón «Usar» y chips Álbum / álbumes / Bulk). Solo cuentan las cartas que ya tienen lugar; las recién recibidas no influyen.
- Una carta guardada en un álbum muestra un chip amarillo 📒 con su casilla (o página y bolsillo); en el editor de la carta la ubicación se cambia entre Álbum y Bulk. En **Bulk → Por colocar** solo quedan las cartas sin ningún lugar.
- **C4 · «valor» → «precio»** (precio estimado, precio de mercado, precio de lo que tienes, para completar…).

## 5. Bloque D · Inicio del Mercado

- **🔥 Más vendidas** (ventas de los últimos 30 días con copias disponibles; si hay pocas, se completa con las más publicadas y las más deseadas) y **💎 Cartas de mayor precio** (ofertas activas más caras). Cada tarjeta: imagen, nombre, colección, precio más bajo, copias y ventas; abre la carta con sus ofertas.
- Los carruseles se desplazan solos en loop, también con el dedo o el mouse; se pausan al tocar o pasar el mouse; con «reducir movimiento» del sistema no se mueven solos. Se actualizan en vivo. Las cartas sin stock no aparecen.
- Debajo: buscador del mercado, tu lista de deseos y las recién publicadas.

## 6. Bloque E · Botones más grandes

- Todo lo tocable mide al menos **44 px** (48 px en el celular): botones, chips de filtros, pestañas, campos, pasos +/−, interruptores, casillas y botones de las hojas; letra un poco mayor y más espacio entre botones. Probado a 360 px de ancho y en PC sin que se rompa el diseño.

## 7. Pruebas automáticas (todas en verde)

- `npm test`: 52 pruebas (incluye `test/sugerir.test.ts` del motor de sugerencias y la deduplicación de Limitless).
- `node test/e2e.mjs`: 68 pasos; incluye la cadena de la tarea diaria, el botón de mazos, el tipo de cambio, la navegación nueva, Recibidas con sugerencias, los carruseles y el desplazamiento/tamaños en PC y celular (390 y 360 px).

## 8. Si algo falla

- **«Guardar en Álbum» da error / no aparecen los carruseles**: falta pegar `0005_mejoras1.sql`.
- **Sigue diciendo «Caja 1»**: el SQL renombra solo los nombres «Caja N»; si tu Bulk tiene otro nombre, edítalo en Mi Colección → Bulk → Editar.
- **Mazos: menos de 15 arquetipos**: /admin → Precios y tareas → «Actualizar mazos ahora»; si aparece un error por arquetipo, mándamelo.
- **Tipo de cambio en rojo**: pulsa «Descargar ahora»; si sigue fallando, la fuente (open.er-api.com) está caída y se usa el último valor.
