# PokéTCG v2 · Layout — Guía corta (rediseño visual)

Publicado en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`). Solo cambia lo visual: ninguna regla de negocio, base de datos, precio, pago ni correo cambió.

## 1. Lo que tienes que hacer tú

- Nada en Supabase, Vercel ni GoDaddy. Solo probar en poketcg.pe en el celular y en la PC (y en modo oscuro desde Ajustes).
- Si algo se ve mal, mándame la pantalla y en qué dispositivo.

## 2. Bloque A · Estilo base y componentes

- **Tokens de color** (`src/app/globals.css`, arriba del todo): `--fondo`, `--tarjeta`, `--sombra`, `--linea`, `--primario`, `--primario-hover`, `--enlace`, `--acento`, `--texto`, `--texto-2`, `--suave`, `--aviso-*`, `--info-*`, `--ok-*`, `--peligro-*`, `--carpeta` (hoja de álbum) y `--energia-*` (fuego, psíquico, planta, agua, eléctrico…). Toda la app los usa; ya no quedan colores sueltos del diseño anterior. Modo oscuro: los mismos tokens en versión oscura (fondo `#141A2E`, tarjeta `#1E2640`, texto `#F3F5FF`…).
- **Tipografía**: títulos en **Fredoka** (600/700) y texto en **Nunito** (500–800). Son las fuentes de Google Fonts, pero se sirven desde la propia app (`src/fonts/*.woff2`, licencia OFL) con `next/font/local`: así la compilación no depende de internet, carga más rápido y no hay parpadeo. Tamaños: título de pantalla 26 px (celular) / 32 px (PC), secciones 18–24 px, texto 15–16 px, secundario 13 px en negrita.
- **Componentes base** (`src/components/ui.tsx`, `Sheet.tsx`, `Icono.tsx`): `Tarjeta`, `BotonPrimario`, `BotonSecundario`, `BotonAcento`, `Chip`, `Etiqueta` (+ `EtiquetaIdioma`, `EtiquetaEstado`), `BarraProgreso`, `PildoraEstado`, `LineaAvance` (4 puntos), `MiniCarta` (63:88), `CasillaAlbum`, `Cabecera`, `HojaInferior`/`Ventana` (la misma hoja: abajo en el celular, centrada en la PC) y el carrusel en loop (`CarruselMercado`).
- **Iconos**: trazo simple (Lucide) con nombres en español (`<Icono n="carrito" />`). **No quedan emojis en la interfaz**; los tipos de energía son puntos de color. Los avisos ya enviados (notificaciones y correos antiguos) conservan su texto.
- **Tamaños táctiles**: todo lo tocable mide al menos 44 px (48 px en el celular); botones principales 48–56 px; barra inferior 56 px.
- Sin logo, Pokébola ni tipografía oficial de Pokémon.

## 3. Bloque B · Navegación

- **Celular (< 1024 px)**: barra inferior fija con las dos pestañas grandes **Mi Colección** y **Mercado** (la activa en azul). Arriba: logo + «PokéTCG», botón amarillo del carrito con el número de cartas y el avatar con tus iniciales (Ajustes y perfil, Notificaciones, Centro de ayuda, Tienda/Administración si aplica, Cerrar sesión). La campana solo aparece cuando hay notificaciones sin leer. En las pantallas interiores (una carta, un álbum, un Bulk, una compra, un mazo, Ajustes…) el logo se cambia por **«volver»** + el nombre de la pestaña.
- **PC (≥ 1024 px)**: barra superior blanca con el logo, las dos pestañas en una cápsula crema, **buscador ancho** (busca en tu colección o en el mercado según la pestaña), carrito amarillo y avatar. Sin barra inferior.
- **Mi Colección**: en el celular, título «Mi Colección», tarjeta **Precio de mi colección** (cartas y distintas) y chips Álbumes · Bulk · Buscar · Mis ventas. En PC, **menú lateral izquierdo** (300 px) con el precio de la colección, el menú (Álbumes, Bulk, Buscar / Escanear, Mis ventas con el número de órdenes por entregar) y **Por llegar** (compras pendientes). El lateral se muestra en Álbumes, Buscar/Escanear y Mis ventas; el Bulk y los detalles usan todo el ancho, como en las maquetas.
- **Mercado**: chips Inicio · Mazos · Carrito · Mis compras en ambos tamaños. En el celular, el Inicio lleva el buscador grande con el botón de **buscar por foto** (abre el escáner); en PC se busca desde la barra superior.
- Al iniciar sesión se abre Mi Colección → Álbumes. Las direcciones antiguas siguen funcionando.

## 4. Bloque C · Mi Colección

- **Álbumes** (`/app/album`): Por llegar (compras pendientes) y Recibidas arriba; luego **Mis álbumes** en cuadrícula (2 columnas en celular, 3 en PC) con portada (la carta más rara que tienes; los álbumes propios usan un color de energía), nombre, etiqueta de idioma o «Propio», barra de progreso, «X / Y» y el precio del álbum; botón **+ Nuevo álbum**. En PC, filtros Todos / Por colección / Propios.
- **Álbum de una colección** (`/app/album/<colección>`): **hoja de carpeta** sobre fondo oscuro, 3 × 3 por página en el celular (flechas grandes y «Página X de N · cartas a–b») y **dos páginas lado a lado** en PC con «Ir a página». Casilla que tienes: imagen, número y «×N»; casilla que falta: punteada con el número y «En mercado · S/ X» o «Sin stock» (lleva a la carta en el mercado). Tarjeta con progreso, **Precio del álbum** y **Para completarlo** (se calcula al tocar «Consultar…» para no pedir cientos de precios de golpe); filtros Todas / Tengo · N / Faltan · N; botones **Agregar carta**, **Comprar faltantes en el mercado** y **Poner en venta…**.
- **Bulk** (`/app/bulk`): selector de Bulks en tarjetas (el activo en azul; cambia sin recargar) + «+ Nuevo Bulk»; tarjeta del Bulk con precio e interruptor **Bulk en venta**; buscador dentro del Bulk; **lista** por secciones «151 · posiciones 35–39» en celular y **tabla** en PC (posición, carta, colección, n.º, idioma, estado, cantidad, precio, mercado). Editar, mover, elegir cuáles vender y eliminar siguen ahí. «Por colocar» (cartas sin lugar) se mantiene arriba.
- **Mis ventas** (`/app/ventas`): cuadros **Por cobrar** (ventas en curso) y **Por pagarte** (el pago te lo hace el admin cada día a tus datos de cobro; no hay botón «Retirar» porque no existe esa acción) y «Ya pagado»; aviso de publicaciones pausadas por foto; pestañas **Por entregar · N / En venta · N / Historial**. Cada venta muestra las cartas, **dónde están** (Bulk y posición, o álbum y casilla), una píldora con lo que hay que hacer y su botón (Elegir fecha, Imprimir rótulo, Ya la dejé en la tienda): abre el detalle de la orden, donde está la acción. Tu reputación queda abajo. `/app/ventas/ordenes` redirige a la pestaña Por entregar.
- **Carta recibida**: en Álbumes → Recibidas, cada carta abre la **hoja «¿Dónde la guardas?»** (ventana centrada en PC) con la carta, el destino **sugerido** en un recuadro azul (página y casilla, o posición del Bulk) con el motivo, y los botones Guardar en este álbum / Elegir otro álbum / Guardar en Bulk N · posición #M, más «Decidir después».

## 5. Bloque D · Mercado

- **Inicio** (`/app/mercado`): buscador grande con botón de **buscar por foto** (abre el escáner; para que busque ofertas directamente hace falta un cambio pequeño que te propongo aparte), carruseles **Más vendidas** (últimos 30 días) y **Mayor precio** (disponibles ahora) en loop, y **Recién publicadas**. En PC los carruseles muestran 6 cartas.
- **Carta en el mercado** (`/app/carta/<id>`): imagen grande (columna izquierda en PC) con **Favorito** y **Compartir**; nombre, colección · número · rareza y **Precio de mercado** en un recuadro; aviso azul **«Te falta en tu álbum X (casilla N)»** cuando coleccionas esa colección y no la tienes; **N ofertas · más barata primero** con filtros Todos / EN / ES / JP / Solo NM; ofertas en tarjetas (celular) o tabla (PC) con vendedor, estrellas y ventas, idioma, estado, foto real, precio y **Agregar al carrito**; **Últimas ventas en la red**; abajo «En tu colección», «Guardar en mi colección» y los datos de la carta. La columna «Recojo: [Tienda]» de la maqueta no va: la tienda se elige al pagar, no por oferta.
- **Mazos** (`/app/mazos`): «Standard · actualizado … · fuente: Limitless»; filtros **Sugeridos para mí / Todos / Más jugados**; tarjeta por arquetipo (3 columnas en PC) con puntos de energía (tipos de sus Pokémon principales, del catálogo), cuota del meta, n.º de variantes, etiqueta **Sugerido para ti** (≥ 50 %), **tu mejor variante** con barra y «te faltan N cartas · ≈ S/ P», y botones **Ver variantes** y **Comprar faltantes**.
- **Carrito** (`/app/carrito`): «N cartas · reservadas para ti hasta las HH:MM», líneas con cantidad y el botón de **quitar**, **¿Dónde la recoges?** con las tiendas como opciones grandes (horario, recojo gratis o tarifa, cómo llegar), **Usar mi saldo**, resumen (cartas, recojo en tienda, total a pagar) y **Continuar al pago**. En PC el resumen va a la derecha.
- **Pago** (`/app/compras/<id>`): pasos **1 Yapea → 2 Sube la captura → 3 Confirmamos**, monto grande, recuadro del QR (de momento sin imagen: usa el número), número de Yape con **Copiar**, titular, contador de minutos, zona grande **Subir captura del Yape**, **N.º de operación** y **Enviar comprobante**. En PC: tus órdenes a la izquierda y el pago a la derecha.
- **Mis compras** (`/app/compras`): **Mi saldo** con Retirar; pestañas **En curso / Terminadas**; cada compra con su **línea de avance** de 4 pasos (Pago en revisión · Pagado · En tienda · Entregado), el mensaje de qué sigue (tienda y fecha, o código de retiro) y los botones **Ya la recogí / Tengo un problema** (abren el detalle, donde se confirma o se reclama).

## 6. Bloque E · Ajustes finales

- El mismo estilo (tokens, Fredoka/Nunito, componentes) se aplica a la **portada**, **registro/ingreso/recuperar**, **ayuda**, **tiendas**, **perfil público**, **ficha pública de la carta**, **Ajustes**, **notificaciones** y **/admin** (ahí solo cambian colores, tipografía y componentes; la distribución es la misma). La barra pública muestra solo lo esencial en celulares angostos.
- **Correos**: la plantilla usa los colores nuevos (fondo crema, tarjeta blanca, botón azul) y Nunito/Fredoka como tipografía de respaldo (si el correo no las tiene, usa la del sistema). Los textos no cambian.
- **App instalada**: el manifiesto y la página «Sin conexión» usan los colores nuevos; la caché del service worker se renovó (`poketcg-v2-2`) para que los celulares descarguen el diseño nuevo solos.
- **Revisiones**: sin desplazamiento horizontal a 360 px (lo comprueba el E2E en 17 páginas), foco visible con teclado (anillo azul), contraste ≥ 4.5:1 en los textos sobre sus fondos (texto secundario `#565E7A` sobre crema = 5.6:1, azul del botón = 6.3:1, avisos ≥ 6:1) y el diseño es fluido, así que al 200 % de zoom las tarjetas pasan a una columna.
- Las capturas de cada pantalla (celular 390×844 y PC 1280×800) están en `D:\POKEMON APP\v2\capturas-layout\` (se generan con `node test/capturas.mjs`).

## 7. Qué no cambió (y qué queda para después)

- Ninguna regla de negocio, precio, pago, correo ni base de datos: no hay SQL nuevo que pegar.
- **Buscar por foto en el Mercado**: el botón abre el escáner actual (que guarda la carta). Para que, al reconocer la carta, abra directamente sus ofertas hace falta un cambio pequeño en el escáner; dime si lo hago.
- **QR de Yape**: el recuadro queda listo; falta subir la imagen del QR en /admin (no existe ese campo todavía).
- **«Retirar» para el vendedor**: no existe esa acción (el pago lo hace el admin cada día a tus datos de cobro), por eso Mis ventas muestra «Por pagarte» en lugar de un botón.
- **Tienda de recojo por oferta**: la tienda se elige al pagar (una por compra), no por oferta.

## 8. Pruebas automáticas (todas en verde)

- `npm test`: 52 pruebas.
- `node test/e2e.mjs`: 68 pasos (selectores actualizados a la nueva distribución y a los textos sin emojis).
- `node test/capturas.mjs [carpeta]`: capturas de cada pantalla en celular (390×844) y PC (1280×800) para compararlas con las maquetas.
