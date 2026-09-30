# PokéTCG — tu colección Pokémon TCG, ubicada al instante

Aplicación web (https://poketcg.pe) para registrar una colección de cartas Pokémon TCG, organizarla en cajas y
álbumes y saber en qué caja y en qué posición está cada carta, desde cualquier dispositivo y en tiempo real.
Es la versión 2 (multiusuario, en la nube) de PokéBóveda.

**Estado: Fase 1** — cuentas, catálogo, cajas con ubicación, álbumes por colección y álbumes físicos,
búsqueda por texto, valor de la colección, importación del respaldo de la v1. Pendiente de la Fase 1:
búsqueda por foto (cámara). Guía de puesta en marcha: [`GUIA-DESPLIEGUE.md`](GUIA-DESPLIEGUE.md).

## Cómo está hecha

| Pieza | Tecnología |
|---|---|
| App web (móvil y PC, instalable como PWA) | Next.js 15 (App Router) + React 19, TypeScript, CSS propio |
| Base de datos, cuentas, tiempo real | Supabase (PostgreSQL con RLS, Auth, Realtime) |
| Correos (verificación, recuperación) | Resend, enviados desde el servidor con plantillas en español |
| Publicación | Vercel (despliegue automático desde GitHub) |
| Precios de mercado | TCGdex (TCGplayer en USD, Cardmarket en EUR convertido), caché compartida en la base |

```
public/data/catalogo.json     catálogo: 322 colecciones, 34 498 cartas (int. + japonesas), 1 025 especies
supabase/migrations/          SQL que se pega en Supabase (tablas, seguridad por filas, tiempo real)
supabase/admin/               SQL para nombrar administrador
src/app/                      páginas y rutas API (registro, ingreso, recuperación, precios, importación…)
src/components/               interfaz (proveedores de catálogo/colección/precios, vistas, hojas)
src/lib/                      lógica pura: catálogo, búsqueda, ubicación en cajas, validación, precios
tools/                        generar y validar el catálogo
test/                         pruebas unitarias, Supabase simulado y prueba de extremo a extremo
```

Reglas de negocio principales (heredadas de la v1):

- **Cajas**: cada caja se ordena "por colección y número" (posición calculada por la app: fecha de la colección,
  colección, número) o "manual". Al guardar una carta la app dice: caja, posición N de M, sección y las cartas
  vecinas. Copias iguales (misma carta, acabado e idioma, misma caja) se suman en una sola entrada.
- **Álbumes por colección**: uno por colección e idioma con al menos una carta; las que faltan en gris oscuro;
  costo de completar con los precios de mercado.
- **Álbumes físicos**: carpetas de N páginas × (columnas × filas) bolsillos; a cada bolsillo se le asigna una
  carta (arrastrar para mover; "Rellenar con una colección").
- **Valor** = precio unitario según acabado × cantidad, sumado sobre toda la colección.
- **Privacidad**: DNI, celular y correo solo los ve su dueño (RLS); el rol y el DNI no se pueden cambiar desde la app.

## Desarrollo

```bash
npm install
cp .env.example .env.local        # y rellena las claves (nunca se sube)
npm run dev                       # http://localhost:3000

npm test                          # pruebas unitarias (búsqueda, posiciones, validación, precios)
npm run catalogo                  # regenera public/data/catalogo.json desde tools/fuente-v1-*.js y lo valida
```

Prueba de extremo a extremo (registro → verificación → cajas → cartas → álbumes → importación → recuperación),
sin Supabase real: PostgreSQL local + `test/mock-supabase.mjs` (Auth y PostgREST simulados con las mismas
políticas RLS) + Playwright. Ver `test/reiniciar.sh` y `test/e2e.mjs`.

Datos de cartas: TCGdex y Pokémon TCG API (proyectos comunitarios). Imágenes: TCGdex / pokemontcg.io.
Proyecto personal sin afiliación con Nintendo, Creatures, GAME FREAK ni The Pokémon Company.
