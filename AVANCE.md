# AVANCE · PokéTCG v2 — Mejoras 5

Última actualización: 2 de octubre de 2026. Copia en `D:\POKEMON APP\v2\AVANCE.md` y en el repositorio.

## Estado

- **Mejoras 5 · bloque A (errores de álbumes): listo** y publicado en https://poketcg.pe (rama `main`).
- **Siguiente bloque: B** (tipos de álbum al crear: Colección oficial · Un Pokémon · Un tipo · Un ilustrador · Cartas sueltas, asistente de 3 pasos; maquetas `M5-PC-Nuevo` y `M5-Nuevo`). No empieza hasta que digas "sigue".
- Después: C (buscador y filtros a la izquierda en Mercado y Mi Colección; hoja "Filtros · N" en celular) y D (barra superior con secciones, sin buscador; "Mi tienda" solo con stock en venta).

## Lo que tienes que hacer tú (bloque A)

1. **Opcional pero recomendado**: Supabase → SQL Editor → New query → pega completo `D:\POKEMON APP\v2\supabase\0010_mejoras5.sql` → Run. Arregla las copias que ya quedaron mal (las que guardaste con "Ya la tengo" desde un bolsillo y acabaron en un álbum de colección): las enlaza a su bolsillo **solo cuando no hay duda** (una sola copia, y era la única carta de esa colección en ese álbum). Al final dice cuántas enlazó ("Mejoras 5 · A: N copia(s) enlazada(s)"). Se puede pegar varias veces; no borra nada.
2. Las que el script no pueda deducir se arreglan a mano en 2 toques: abre el bolsillo → **"Traer aquí la de …"** (mueve la copia que ya tienes desde donde esté).
3. Si todavía no pegaste `0009_mejoras4.sql` (Pokédex y filtros nuevos del Mercado), pégalo también.

Nada en Vercel ni en GoDaddy.

## Qué cambió en el bloque A

- **A1 · "Ya la tengo" en un bolsillo**: ahora abre la misma ventana rápida del "+" (acabado, cantidad, estado NM, idioma sugerido = el que más usas, cambiable) y la copia queda **en ese bolsillo de ese álbum** (sin álbum de colección ni Bulk). Si pones más de 1, las demás van al Bulk.
- El **"+" de un bolsillo vacío** elige la carta y abre la misma ventana: "Guardar" guarda la copia ahí; "Todavía no la tengo: solo reservar el bolsillo" deja la carta asignada sin copia.
- Si la carta ya la tienes en otro lugar, el bolsillo ofrece **"Traer aquí la de Bulk 2 #37"** (si es una pila de varias, separa 1) y "Agregar otra copia aquí".
- Las copias que están en bolsillos de álbumes personalizados **ya no crean ni llenan álbumes por colección** (ni cuentan en sus casillas); sí cuentan en el precio total y en la Pokédex.
- **A2 · "+" rápido**: si el álbum se abrió sin idioma (o es el álbum "sin idioma"), la copia se guarda con el **idioma que más usas** en esa colección (o en toda tu colección; inglés si no hay), no "sin idioma". Siempre puedes cambiarlo en "Cambiar idioma o estado". (El "Agregar" del buscador sigue preguntando el idioma como antes, con "—" por defecto.)
- Pruebas: `npm test` 88 (nueva: el script 0010 sobre casos claros y con duda, dos pasadas); E2E 87 pasos (nuevos: A1 guardar en bolsillo, + con "solo reservar", "Traer aquí" 1 de 2, A2 idioma sugerido sin álbum nuevo).

## Pendiente / a medias

- Nada a medias del bloque A.
- Bloque B añadirá columnas a `albumes` (`tipo_album` y sus parámetros): tocará pegar otro SQL (te lo diré en su momento).
