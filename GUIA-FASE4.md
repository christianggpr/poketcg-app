# PokéTCG v2 · Fase 4 — Guía corta (reputación, reclamos, saldo, reportes y confianza pública)

Fase 4 terminada y publicada en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`).
Todo lo de las Fases 1, 2 y 3 sigue funcionando igual.

## 1. Lo que tienes que hacer tú

1. **Supabase → SQL Editor** → pega el contenido completo de `supabase/0004_fase4.sql` (la versión más nueva, la de tu carpeta `D:\POKEMON APP\v2\supabase\`) → **Run**. Se puede pegar las veces que quieras: no borra nada. Este archivo trae los cuatro bloques (A reputación, B reclamos y saldo, C reportes, D confianza pública).
2. En **/admin → 💳 Cobros y pagos** revisa el **horario de atención** (se muestra en la portada y en el centro de ayuda junto al WhatsApp) y el **plazo de entrega** (7 días desde el pago y 48 h para elegir fecha; puedes cambiarlos).
3. En **/admin → 🏪 Tiendas** completa, para cada tienda, la **tarifa de recojo** (0 = gratis), el **Instagram**, el enlace **«Cómo llegar»** de Google Maps y, si quieres el mapa en `/tiendas`, la **latitud y longitud** (en Google Maps: clic derecho sobre el local → copiar coordenadas).
4. Nada en Vercel ni en GoDaddy.

## 2. Qué hay de nuevo

### A. Reputación del vendedor
- Al confirmarse una entrega, el comprador puede **calificar** (1–5 ★ y comentario; corregible 7 días) y el vendedor **responder una vez**.
- **Insignias automáticas**: Confirma rápido, Cumple fechas, Sin faltas, Top vendedor, Nuevo. Se calculan con lo que ya guarda la app (horas para elegir fecha, entregas a tiempo, órdenes vencidas, ventas).
- **Perfil público `/u/usuario`** (visible sin cuenta): puntaje, reseñas, insignias y cartas en venta. En el mercado y el carrito cada oferta muestra el puntaje y las ventas del vendedor.
- **Suspensión**: en /admin → 👥 Usuarios puedes suspender o reactivar cuentas (con motivo). Un suspendido no puede comprar ni vender; su colección sigue intacta. Dos faltas en 90 días muestran alerta en el perfil.
- La escala de estado de las cartas pasó a **NM / LP / MP / HP / DM** (con explicación en español); las cartas antiguas se convirtieron solas.

### B. Reclamos, anulación y saldo del comprador
- **Plazos**: el vendedor tiene **48 h** para elegir fecha y debe entregar **hasta 7 días después del pago** (configurable; también existe el modo «hasta el sábado»).
- **Anulación por el comprador** sin escribirte: si el vendedor no eligió fecha en 48 h o no entregó en la fecha prometida, el botón «Anular y recuperar mi dinero» devuelve el monto **al saldo del comprador al instante** y registra la falta. Las órdenes también vencen solas al pasar la fecha límite.
- **Saldo del comprador**: se usa solo en la siguiente compra (si cubre todo, la compra se confirma al instante sin comprobante) o se retira a Yape/Plin/cuenta (entra al Excel del día de pago como «origen: saldo»).
- **Reclamo en tienda**: el comprador (o la cuenta de tienda por él) reclama **antes de llevarse las cartas**, con motivo, detalle y fotos. La orden queda **en disputa** y el pago en espera; tú resuelves en **/admin → 📝 Reclamos**: devolver todo (la orden se anula, las cartas quedan en la tienda para el vendedor y cuenta como falta), devolución parcial (el comprador se queda con las cartas y recibe un monto a su saldo) o entregar tal cual.
- `/terminos` ya describe todo esto (plazos, anulación, reclamos, tarifa de recojo). **Haz revisar los textos por un abogado** antes del lanzamiento abierto.

### C. Reportes (/admin → 📊 Reportes)
- Ventas entregadas, comisiones, neto a vendedores, unidades, ticket promedio, compradores/vendedores, devoluciones (vencidas + anuladas por reclamo), reclamos, usuarios nuevos, publicaciones activas y lo pagado a vendedores.
- Presets (7 / 30 días, este mes, mes pasado, 12 meses), rango libre y agrupación por día / semana / mes con gráfico; tablas de vendedores (con puntaje y faltas), cartas más vendidas y compradores.
- **⬇️ Excel** con 6 hojas (Resumen, Por período, Vendedores, Compradores, Cartas, Órdenes). Solo el administrador puede verlo: la base lo rechaza a cualquier otro.

### D. Confianza pública (sin cuenta)
- **Portada**: «Cómo funciona» en 3 pasos, cifras de la comunidad (coleccionistas, cartas registradas, en venta, vendidas, tiendas), **recién publicadas**, **últimas ventas** y **las más vendidas**, WhatsApp con horario.
- **Ficha pública de cada carta `/carta/<id>`**: datos, precio de referencia en soles, ofertas con reputación del vendedor, **historial de ventas** (precio, estado, idioma, fecha; nunca el comprador) y promedio en PokéTCG. Con título, descripción y datos estructurados para Google (`sitemap.xml` y `robots.txt` incluidos). Desde la app, el botón 🔗 de cada carta comparte ese enlace.
- **Centro de ayuda `/ayuda`**: 37 preguntas en 4 secciones (lo básico, compradores, vendedores, tiendas) con buscador; usa la comisión y los plazos vigentes; contacto por WhatsApp y correo con horario. Enlazado desde la portada, Ajustes y los pies de página.
- **Tiendas `/tiendas`**: tiendas activas por distrito con horario, «abre hoy», tarifa de recojo, teléfono, Instagram, «Cómo llegar» y mapa (si pusiste coordenadas). Al elegir tienda en el carrito también se ve la tarifa y el enlace.
- **Rótulo del sobre**: en la orden de venta, el vendedor imprime o copia una etiqueta (n.º de orden, tienda, fecha, @vendedor, @comprador, cartas) para pegarla en el sobre. El código de retiro sigue siendo la llave.
- **Favoritos / lista de deseos**: corazón ❤️ en cada carta; cuando alguien la publica, el interesado recibe aviso (app + correo, máximo uno al día por carta). La lista se ve arriba del Mercado con la mejor oferta actual.
- **Modo oscuro**: Ajustes → Apariencia (automático / claro / oscuro), guardado en el dispositivo.

## 3. Pendiente (decidido contigo)
- **WhatsApp automático** (bloque E): no hay forma gratuita y permitida; se mantiene el envío manual con un toque desde /admin → 📲 WhatsApp.
- **Google Play** (bloque F): seguimos con el .apk de la portada.
- **Registro en dos pasos** (solo correo al inicio; DNI y celular al vender) y **pasarela de pagos** (tarjetas, Yape automático): quedan para una fase posterior.

## 4. Pruebas automáticas (ya corridas, todas en verde)
- `npm test`: 44 pruebas (las de las Fases 1–3 más reseñas e insignias, suspensión, plazos de 48 h / 7 días, anulación, saldo, reclamos, reportes, páginas públicas y favoritos).
- `node test/e2e.mjs`: 64 pasos de extremo a extremo con tres sesiones (comprador/admin, vendedora y tienda) y una cuarta sin sesión para las páginas públicas.

## 5. Si algo falla
- **«No se pudo cargar» en Reportes, Reclamos o la ficha pública / aparece «relation … does not exist»**: falta pegar `0004_fase4.sql` completo (la versión más nueva).
- **La lista de deseos no aparece**: la tabla `favoritos` llega con `0004_fase4.sql`.
- **/tiendas sin mapa**: falta latitud y longitud en /admin → Tiendas (el botón «Cómo llegar» funciona igual, busca por la dirección).
- **Google no muestra las fichas**: tarda días o semanas; comprueba que `https://poketcg.pe/sitemap.xml` liste `/carta/...` (solo cartas con ofertas o ventas) y registra el sitio en Google Search Console.
- **Un reclamo no se puede abrir**: solo se admite mientras la orden está «En tienda» (antes de retirar las cartas).
