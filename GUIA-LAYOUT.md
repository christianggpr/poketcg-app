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

## 3. Pruebas automáticas (todas en verde)

- `npm test`: 52 pruebas.
- `node test/e2e.mjs`: 68 pasos (selectores actualizados a los textos sin emojis).
- `node test/capturas.mjs [carpeta]`: capturas de cada pantalla en celular (390×844) y PC (1280×800) para compararlas con las maquetas.
