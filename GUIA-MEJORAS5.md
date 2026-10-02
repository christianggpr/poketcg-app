# PokéTCG v2 · Mejoras 5 — Guía corta (errores de álbumes, tipos de álbum, filtros a la izquierda, secciones arriba)

Publicado en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`). Todo lo anterior sigue igual (compras, pagos, tiendas, publicaciones, Pokédex, reglas de álbum y Bulk).

## 1. Lo que tienes que hacer tú (una sola vez)

**Supabase → SQL Editor → New query → pegar completo → Run** (copias en `D:\POKEMON APP\v2\supabase\`), en este orden si alguno falta:

1. `0009_mejoras4.sql` (si no lo pegaste en Mejoras 4: Pokédex y filtros nuevos del Mercado).
2. `0010_mejoras5.sql` (opcional, bloque A): enlaza a su bolsillo las copias que "Ya la tengo" dejó en un álbum por colección, **solo cuando no hay duda** (una sola copia y era la única carta de esa colección en ese álbum). Al final dice cuántas enlazó. Las que no pueda deducir se arreglan en 2 toques: abre el bolsillo → **"Traer aquí la de …"**.
3. `0011_mejoras5b.sql` (bloque B): añade a los álbumes `tipo_album` y `parametros` para que cada álbum recuerde de qué es. Sin pegarlo la app funciona igual, pero los álbumes nuevos quedan como "Propio" (sin etiqueta ni Sugerencias) y la app te lo avisa al crear uno.

Todos son idempotentes (se pueden pegar varias veces) y no borran nada. Los bloques C y D no llevan SQL. Nada en Vercel ni en GoDaddy.

## 2. Bloque A · Errores de álbumes (arreglados)

- **"Ya la tengo: guardar aquí"** en un bolsillo abre la misma ventana rápida del "+" (acabado, cantidad, estado NM, idioma sugerido = el que más usas, cambiable) y la copia queda **en ese bolsillo de ese álbum**: no se crea ni se llena ningún álbum por colección ni Bulk. Si pones más de 1, las demás van al Bulk.
- El **"+" de un bolsillo vacío** elige la carta y abre la misma ventana: "Guardar" guarda la copia ahí; "Todavía no la tengo: solo reservar el bolsillo" deja la carta asignada sin copia.
- Si la carta ya la tienes en otro lugar, el bolsillo ofrece **"Traer aquí la de Bulk 2 #37"** (de una pila de varias separa 1) y "Agregar otra copia aquí".
- Las copias que están en bolsillos de álbumes personalizados **ya no crean ni llenan álbumes por colección**; sí cuentan en el precio total, en la Pokédex y en Buscar.
- **"+" rápido** en un álbum por colección abierto sin idioma: la copia se guarda con el **idioma que más usas** en esa colección (o en toda tu colección; inglés si no hay), nunca "sin idioma".

## 3. Bloque B · Tipos de álbum al crear (asistente de 3 pasos)

- **Nuevo álbum** → Paso 1 "¿De qué es tu álbum?" con 5 tarjetas: **Colección oficial · Un Pokémon · Un tipo · Un ilustrador · Cartas sueltas**. Paso 2: el detalle con "[N] cartas en el catálogo · tienes [N]". Paso 3: portada y tamaño (color, marca de agua, cuadrícula). "Cartas sueltas" salta directo al paso 3 (es el álbum libre de siempre).
- **Un Pokémon**: buscas el Pokémon (nombre o n.º), eliges idioma (Todos / EN / ES / JP) y si incluye **evoluciones** (p. ej. Caterpie + Metapod + Butterfree). Se rellena solo con todas sus cartas en orden por fecha de colección; las páginas se calculan solas.
- **Un ilustrador**: buscas el artista; hasta 300 cartas se rellena solo; con más, empieza vacío con Sugerencias.
- **Un tipo** (Planta, Fuego…): son miles, así que empieza vacío y se abre **Sugerencias** (también en Acciones): las que tienes van primero, filtros por colección y rareza, "Marcar las que tengo" y "Agregar N al álbum" (añade páginas si hacen falta).
- **Colección oficial**: eliges colección e idioma; aparece en Mis álbumes con el nombre que le pongas aunque no tengas ninguna carta (usa la hoja de la colección de siempre). Acciones → "Quitar de Mis álbumes".
- Las cartas que ya tienes se ven como **"tengo" sin moverlas** (como en la Pokédex). Al abrir el álbum recién creado pregunta **"Tienes N cartas que encajan. ¿Ponerlas en este álbum?"**: "Sí" mueve cada copia a su bolsillo (el álbum pasa a ser su ubicación; de una pila separa 1); "No, solo marcarlas" las deja donde están. Después sigue en Acciones → "Poner aquí las que tengo (N)".
- En Mis álbumes cada álbum propio lleva su etiqueta (Pokémon / Tipo / Ilustrador / Propio) y un subtítulo ("Caterpie + evoluciones", "Tipo Planta", "Mitsuhiro Arita").

## 4. Bloque C · Buscador y filtros a la izquierda

- **Mercado → Explorar en PC**: dos columnas. Izquierda (~270 px): buscador con **cámara**, "¿Quisiste decir…?" y la tarjeta **Filtros** (Precio, Idioma, Colección, Tipo, Ilustrador, Rareza, Acabado, **Estado en botones** NM/LP/MP/HP/DM, **Punto de entrega**, Solo con foto real, Vendedor con buena reputación), botón **Aplicar filtros** (los cambios quedan en borrador hasta pulsarlo) y **Limpiar**; se pliega con la flecha y se recuerda. Derecha: título **Explorar**, "[N] cartas en venta · página X de Y", **Ordenar**, cuadrícula/lista, chips de filtros quitables, **cuadrícula de 5 cartas por fila** (4 a 1280 px: imagen, colección y número, nombre, copias y vendedor, precio más bajo, "Mercado: S/ X" y **corazón** de favorito) y paginación de 40 en 40.
- **Punto de entrega**: no filtra el mercado (cualquier vendedor entrega en cualquier tienda aliada): es la tienda donde prefieres recoger; se recuerda en tu dispositivo y el carrito la deja elegida.
- **Mi Colección en PC**: columna izquierda = **precio de mi colección** · buscador con cámara · tarjeta **Filtros** (Dónde Todo/Álbumes/Bulk, Colección, Tipo, Ilustrador, Rareza, Idioma y Acabado, Estado, Precio, En venta). Sin búsqueda ves la sección elegida (Álbumes, Bulk o Mazos); al escribir o tocar un filtro, a la derecha salen **"Resultados para «…»"** con "N tuyas · M del catálogo", **En tu colección** (con ubicación) y **Otras cartas**. Los chips y la tarjeta van sincronizados. Cada Bulk conserva además sus propios filtros.
- **Celular**: el buscador (con la cámara dentro) y el botón **"Filtros · N"** van en la misma fila; el botón abre una hoja con **Limpiar** arriba y **"Ver N cartas"** abajo. Explorar se ve en cuadrícula de 2 (o en lista).
- Todo (texto, filtros, orden, vista y página) queda en la **dirección** de la página (`/app/mercado?coleccion=sv03.5&tipo=Grass&vista=lista&pagina=2`) para compartir o volver.

## 5. Bloque D · Barra superior con secciones

- **PC**: la barra es **logo · Mi Colección / Mercado · secciones · carrito amarillo · perfil**. Las secciones de la pestaña activa van como pestañas con **subrayado azul**: Mi Colección → **Álbumes · Bulk · Mazos**; Mercado → **Explorar · Mis compras · Mis ventas · Mi tienda**. Entre 1024 y 1279 px se acortan (Compras · Ventas · Tienda).
- **Ya no hay buscador en la barra**: está en la columna izquierda de cada pantalla (bloque C). Se quitó el menú lateral viejo de secciones; en la columna de Mi Colección queda el precio arriba de los filtros.
- **Mi tienda** = tu página pública (`/u/tu_usuario`, con tus cartas en venta, reputación y reseñas, como la ven los compradores). **Solo aparece si tienes cartas en venta** (publicaciones activas).
- **Explorar** es ahora el inicio del Mercado (`/app/mercado`): sin búsqueda ni filtros muestra arriba los destacados ("Más vendidas" y "Mayor precio") y debajo la cuadrícula de todo lo que está en venta (más nuevas primero). La dirección antigua `/app/mercado/buscar` sigue funcionando (redirige).
- **Celular**: las secciones siguen como chips arriba del contenido (Explorar · Compras · Ventas · Tienda / Álbumes · Bulk · Mazos); abajo, las dos pestañas principales.

## 6. Pruebas

`npm test`: 93 pruebas (lógica, portadas y patrones, cuadrícula, Pokédex, filtros y búsqueda tolerante, tipos de álbum y línea evolutiva, scripts 0010 y 0011 sobre PostgreSQL). E2E (`node test/e2e.mjs`): 97 pasos en verde, incluidos los bloques A (Ya la tengo, +, Traer aquí, idioma sugerido), B (asistente en celular y PC, Un Pokémon con "¿Ponerlas?", Un tipo con Sugerencias, Colección oficial, Un ilustrador, sin 0011), C (Explorar y Mi Colección en PC, hoja de filtros en el celular) y D (barra con secciones, Mi tienda, 1024 px, chips, redirección), más la revisión de textos en 360, 768, 1024 y 1280 px.
