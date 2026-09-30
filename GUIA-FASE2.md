# PokéTCG v2 · Fase 2 — Guía corta (mercado, precios, mazos)

Fase 2 terminada y publicada en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`).
Todo lo de la Fase 1 sigue funcionando igual.

## 1. Lo único que tienes que hacer tú

1. **Supabase → SQL Editor** → pega el contenido de `supabase/0002_fase2.sql` → **Run**.
   - Se puede pegar las veces que quieras (no borra nada). Cada bloque de la Fase 2 lo fue ampliando: pega siempre el archivo más nuevo.
2. **Vercel → Settings → Environment Variables**: debe existir `CRON_SECRET` (ya la creaste en el bloque A). Sin ella la tarea diaria no corre.
3. **Supabase → SQL Editor** → `supabase/programar-tareas.sql` con tu `CRON_SECRET` en lugar de `PON-AQUI-TU-CRON-SECRET` (ya hecho en el bloque A; solo si cambias la clave).
4. Nada en GoDaddy.

Comprueba en **poketcg.pe/admin → Tareas** que la tarea de hoy diga `ok`. Si dice `error`, el detalle explica qué falló.

## 2. Qué hace cada parte

### A · Precios en soles y precio por defecto
- Valor de mercado por acabado e idioma: TCGplayer (US$) → soles; si no hay, Cardmarket (€) → soles. Cartas japonesas: Cardmarket o "sin precio".
- Tipo de cambio diario (con respaldo configurable en /admin).
- **Precio por defecto = el mayor entre el piso y el mercado.** Pisos: S/ 1.00 normales, S/ 2.00 holo/reverse/ex/V/full art/secretas/1.ª edición. Editables en /admin (Mercado).
- Tarea diaria 00:00 Lima: renueva precios de cartas en colecciones y publicaciones, recalcula precios por defecto, valor de colecciones, libera reservas vencidas y actualiza los mazos meta. Queda registrada en /admin.

### B · Vender (cajas en venta y publicaciones)
- Al crear una caja o guardar una carta se pregunta si se sube a la nube: **Sí, todas / Solo esta / Elegir cuáles / No por ahora**.
- Cada caja tiene el interruptor **"Caja en venta"**: al encenderlo se publican sus cartas y las nuevas se publican solas.
- **Mis ventas** (Cajas → Mis ventas, o Ajustes): estados, pausar/activar/retirar en bloque.
- **Editar publicación**: precio por defecto o manual, valor de mercado, precio más bajo en la red, lo que recibes (precio − 5 %), aviso si te alejas ±30 % del mercado, "Volver al precio por defecto".
- **Foto obligatoria por encima de S/ 50**: sin foto la publicación queda pausada (también si la tarea diaria sube el precio); al agregar la foto se activa. Fotos comprimidas (~1600 px) en el bucket `fotos-publicaciones`; se borran al retirar.
- Si cambias la cantidad de una carta o la eliminas, la publicación se ajusta o se borra sola.
- Los compradores solo ven tu **nombre de usuario**: nunca DNI, celular ni nombre real.

### C · Mercado, carrito y reservas
- Pestaña **Mercado**: búsqueda por nombre (ES/EN/JP), número y colección; filtros por colección, idioma, acabado, estado y precio; orden por novedad, precio o valor; "Solo las que me faltan".
- Detalle de carta: **"Disponible en la red: N copias desde S/ X"** y **Agregar al carrito** (no puedes comprar tus propias cartas).
- **Carrito**: reservas de 24 h; total y comisión; **"Comprar" muestra "Próximamente"** (el pago llega en la Fase 3).
- **Sin doble venta**: la reserva se hace en la base con bloqueo de fila (`reservar_copia`): dos personas nunca se llevan la misma copia. Probado con dos compradores a la vez.
- Álbum: las cartas que faltan y que alguien vende muestran "🛒 S/ X".

### D · Mazos meta
- La tarea diaria descarga de Limitless los mazos del formato estándar (últimos 3 meses) y sus últimas listas; agrupa en **variantes** (listas con ≥ 90 % de coincidencia). Si Limitless falla, se conserva la última versión.
- **Mercado → Mazos meta**: % que tienes de la variante más completa, cartas que faltan y costo aproximado; sugerencia cuando pasas el 50 %.
- Detalle: variantes (la más completa resaltada), diferencias, cada carta con "tienes / te faltan" y si está en venta; **"Comprar lo que me falta"** reserva las ofertas más baratas.
- Cuenta primero la misma impresión; luego equivalentes (mismo nombre en entrenador/energía; mismo nombre y PS en Pokémon). Las japonesas no cuentan; ES/EN sí.

### E · Huellas compartidas y modo sin conexión
- Al preparar una colección para el escáner, las huellas se suben al bucket `huellas` y los demás usuarios las descargan en segundos.
- Service worker: la app y las imágenes quedan en caché; sin internet aparece un aviso.

## 3. Pruebas automáticas (ya corridas, todas en verde)
- `npm test`: 24 pruebas (precio por defecto, foto > S/ 50, caja en venta, mercado sin datos personales, dos compradores por la misma copia, recálculo diario, parseo de Limitless, variantes, equivalentes, huellas).
- `node test/e2e.mjs`: 40 pasos de extremo a extremo (Fase 1 + toda la Fase 2).
- `node test/e2e-escanear.mjs`: escáner.

## 4. Si algo falla
- **Los mazos no aparecen**: /admin → Tareas → "Forzar una ejecución nueva". Si el detalle dice "Limitless no respondió", el servidor de Vercel no pudo entrar a limitlesstcg.com: avísame.
- **Una publicación quedó pausada**: casi siempre es la foto obligatoria (> S/ 50). Ábrela desde Mis ventas y agrega la foto.
- **"No se pudo consultar el mercado"**: falta pegar `0002_fase2.sql` completo.
