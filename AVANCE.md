# AVANCE · PokéTCG v2 — Mejoras 5

Última actualización: 2 de octubre de 2026. Copia en `D:\POKEMON APP\v2\AVANCE.md` y en el repositorio.

## Estado

- **Mejoras 5 · bloque A (errores de álbumes): listo** y publicado.
- **Mejoras 5 · bloque B (tipos de álbum al crear): listo** y publicado en https://poketcg.pe (rama `main`).
- **Siguiente bloque: C** (buscador y filtros a la izquierda en Mercado y Mi Colección en PC; hoja "Filtros · N" en celular; filtros en la dirección; maquetas `M5-PC-Mercado`, `M5-PC-Coleccion`, `M5-Mercado`). No empieza hasta que digas "sigue".
- Después: D (barra superior con secciones, sin buscador; "Mi tienda" solo con stock en venta) y al final `GUIA-MEJORAS5.md`.

## Lo que tienes que hacer tú (bloque B)

1. **Pega `D:\POKEMON APP\v2\supabase\0011_mejoras5b.sql`**: Supabase → SQL Editor → New query → pega el archivo completo → Run. Añade a los álbumes dos columnas (`tipo_album` y `parametros`) para que cada álbum recuerde de qué es (Pokémon, tipo, ilustrador, colección oficial). Los álbumes que ya tenías quedan como "Cartas sueltas". Se puede pegar varias veces; no borra nada.
   - Sin pegarlo, la app sigue funcionando y los álbumes nuevos se crean y se rellenan igual, pero quedan como "Propio" (no muestran su tipo ni ofrecen Sugerencias). Al crear uno te lo avisa.
2. Si todavía no pegaste `0010_mejoras5.sql` (bloque A) o `0009_mejoras4.sql` (Pokédex y filtros del Mercado), pégalos también (en orden: 0009, 0010, 0011).

Nada en Vercel ni en GoDaddy.

## Qué cambió en el bloque B

- **"Nuevo álbum" es un asistente de 3 pasos** (`/app/album/nuevo`): Paso 1 "¿De qué es tu álbum?" con 5 tarjetas (Colección oficial · Un Pokémon · Un tipo · Un ilustrador · Cartas sueltas); Paso 2 el detalle con "[N] cartas en el catálogo · tienes [N]"; Paso 3 portada y tamaño (lo de Mejoras 3). "Cartas sueltas" salta directo al paso 3 (es el álbum libre de siempre).
- **Un Pokémon**: buscas el Pokémon (nombre o n.º), eliges idioma (Todos / EN / ES / JP) y si incluye evoluciones (p. ej. Caterpie + Metapod + Butterfree). El álbum se rellena solo con todas sus cartas, en orden por fecha de colección; las páginas se calculan solas (puedes subirlas).
- **Un ilustrador**: buscas el artista; con hasta 300 cartas se rellena solo; con más, empieza vacío con Sugerencias.
- **Un tipo** (Planta, Fuego…): son miles, así que el álbum empieza vacío y se abre **Sugerencias** (Acciones → Sugerencias): las que tienes van primero, filtros por colección y rareza, "Marcar las que tengo", y "Agregar N al álbum" las pone en los bolsillos libres (añade páginas si hacen falta).
- **Colección oficial**: eliges colección e idioma; el álbum aparece en Mis álbumes con el nombre que le pongas aunque todavía no tengas ninguna carta (usa la hoja de la colección de siempre). Acciones → "Quitar de Mis álbumes" lo saca (las cartas no se tocan).
- Las cartas que ya tienes se ven como **"tengo"** sin moverlas. Al abrir el álbum recién creado pregunta **"Tienes N cartas que encajan. ¿Ponerlas en este álbum?"**: "Sí" mueve cada copia a su bolsillo (el álbum pasa a ser su ubicación; de una pila de varias separa 1); "No, solo marcarlas" las deja donde están. Después sigue disponible en Acciones → "Poner aquí las que tengo (N)".
- En Mis álbumes, cada álbum propio lleva su etiqueta (Pokémon / Tipo / Ilustrador / Propio) y un subtítulo ("Caterpie + evoluciones", "Tipo Planta", "Mitsuhiro Arita").
- Pruebas: `npm test` 93 (nuevas: cartas por tipo de álbum, línea evolutiva, páginas; 0011); E2E 93 pasos (nuevos: asistente en celular y PC, Un Pokémon con "¿Ponerlas?" y pila separada, Un tipo con Sugerencias, Colección oficial con "Quitar", Un ilustrador, sin 0011 pegado).

## Pendiente / a medias

- Nada a medias del bloque B.
- Bloque C no toca la base (no habrá SQL nuevo); bloque D tampoco, salvo que "Mi tienda" pública necesite algo (te lo diré).
