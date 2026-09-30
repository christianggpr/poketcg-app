# PokéTCG v2 · Fase 3 — Guía corta (compras, pagos, tiendas y avisos)

Fase 3 terminada y publicada en **https://poketcg.pe** (repositorio `christianggpr/poketcg-app`, rama `main`).
Todo lo de las Fases 1 y 2 sigue funcionando igual.

## 1. Lo que tienes que hacer tú

1. **Supabase → SQL Editor** → pega el contenido de `supabase/0003_fase3.sql` (el archivo completo, la versión más nueva) → **Run**.
   Se puede pegar las veces que quieras: no borra nada. Ya trae precargados tu Yape/Plin (949114582, CHRISTIAN GABRIEL PAUCCA ROMERO), el WhatsApp, "todos los días son día de pago" y la tienda **TCG Center Perú** (Lince). Todo eso se edita en **/admin**.
2. **Cuenta de la tienda**: el encargado de TCG Center Perú se registra en poketcg.pe como cualquier usuario; luego tú entras a **/admin → 🏪 Tiendas → "Asignar cuenta"** y escribes su nombre de usuario. Desde ese momento él ve la pestaña **Tienda** con las órdenes de su sede.
3. **Tu celular con WhatsApp (949114582)**: en **/admin → 📲 WhatsApp** aparecen los avisos pendientes; cada uno tiene un botón que abre WhatsApp con el mensaje ya escrito. Solo pulsas "Enviar" y luego "Enviado".
4. **Textos legales**: `/terminos` y `/privacidad` ya describen el mercado (comisión, plazos, entrega en tienda, devoluciones, Ley 29733). Son un borrador serio, pero **hazlos revisar por un abogado** antes del lanzamiento abierto; para editarlos, dime qué cambiar.
5. Nada en Vercel ni en GoDaddy. (Opcional: si quieres una clave propia para cifrar los datos de cobro, crea `DATOS_COBRO_KEY` en Vercel; ver `.env.example`.)

Comprueba que **pg_cron sigue activo** (Fase 2, `programar-tareas.sql`): ahora ese "tick" de cada 10 minutos también vence compras sin comprobante, confirma entregas automáticas, manda recordatorios y envía los correos. En **/admin → 📈 Precios y tareas** la tarea de hoy debe decir `ok`.

## 2. Cómo funciona una compra, de principio a fin

| Paso | Quién | Qué pasa en la app |
|---|---|---|
| 1 | Comprador | Agrega cartas al carrito (reserva de 24 h) y pulsa **Comprar** → elige la tienda de recojo → se crea un **pago** con una **orden por vendedor**. |
| 2 | Comprador | Ve el número de Yape/Plin y el monto; paga y sube la **foto del comprobante** (+ n.º de operación) en **30 minutos**. Si no, la reserva se libera sola. |
| 3 | Tú (admin) | Recibes correo y aviso en **/admin → 🧾 Pagos**. Comprueba el pago en tu app de Yape y pulsa **Confirmar** (o Rechazar con motivo). Se marcan los comprobantes con n.º de operación repetido. |
| 4 | Vendedor | Recibe aviso (app + correo + WhatsApp) con las cartas, **dónde las tiene en su colección** y la tienda. Elige la **fecha de entrega** (días que abre la tienda, hasta el sábado límite). Recordatorios el día anterior y el día de la entrega. |
| 5 | Tienda | Cuando el vendedor deja las cartas, pulsa **Recibido en tienda** (con foto opcional). Si la sede no tiene cuenta, lo marca el vendedor con foto obligatoria. |
| 6 | Comprador | Recibe el **código de retiro de 6 dígitos** (app + correo). Va a la tienda y lo muestra. |
| 7 | Tienda | Pulsa **Retirado por el comprador** y escribe el código (sin código no se entrega). El comprador también puede marcar **Entregado** él mismo desde Mis compras. Si nadie hace nada en **3 días**, se confirma sola. |
| 8 | App | Las copias salen de la colección del vendedor (la publicación queda *vendida*, su foto se borra) y el comprador puede **agregarlas a su colección** con un toque. La ganancia del vendedor (precio − 5 %) pasa a **por pagar**. |
| 9 | Tú (admin) | Cada día recibes por correo el **Excel de pagos** (hojas Yape-Plin, Transferencia, Sin datos, Resumen). Pagas y en **/admin → 💰 Pagos a vendedores** pulsas **Pagado ✔** (n.º de operación y captura opcionales). El vendedor recibe el aviso y ve el comprobante en **Mi saldo**. |

**Fecha límite de entrega**: pago confirmado de domingo a jueves → el sábado de esa semana; viernes o sábado → el sábado siguiente. Si el vendedor no entrega a tiempo, la orden queda **vencida**, las copias vuelven a su colección, y tú recibes el aviso para devolver el dinero al comprador por Yape.

## 3. Pantallas nuevas

- **Comprador**: Carrito → Comprar · **Mis compras** (estado, instrucciones de pago, subir comprobante, código de retiro, "Entregado", "Agregar a mi colección") · 🔔 **Notificaciones**.
- **Vendedor**: Mis ventas → **Órdenes de venta** (cartas con su ubicación, fecha de entrega, foto de entrega) · **Mi saldo** (en curso, por pagarte, ya pagado, movimientos y comprobantes) · Ajustes → **Datos de cobro** (Yape/Plin o banco, cifrados) y **Verificar celular por WhatsApp**.
- **Tienda**: pestaña **Tienda** (por llegar, por retirar, entregadas; recibido y retirado con código). Solo ve nombres de usuario, cartas y códigos.
- **Admin** (`/admin`): 🧾 Pagos por confirmar (con voucher) · 📦 Órdenes · 💰 Pagos a vendedores (+ Excel) · 🏪 Tiendas · 📱 Celulares (verificaciones por WhatsApp) · 📲 WhatsApp pendientes · 💳 Cobros y pagos (número y nombre de Yape/Plin, métodos, WhatsApp de la app, días de pago, minutos para subir el comprobante, días para la confirmación automática, días de espera para pagar al vendedor) · 📈 Precios y tareas · 🗂️ Catálogo.

## 4. Avisos automáticos (app + correo; WhatsApp lo envías tú con un toque)

Comprobante subido (a ti) · pago confirmado / rechazado · fecha de entrega fijada · recordatorios al vendedor · carta en tienda (con código) · recordatorios al comprador (día 1 y 2) · entregado · saldo liberado · Excel del día de pago (a ti, adjunto) · pago realizado (con comprobante) · orden vencida · publicación pausada por superar S/ 50 sin foto.

## 5. Privacidad

- Otros usuarios y las tiendas **nunca** ven DNI, celular, correo, nombre real ni datos de cobro.
- Los datos de cobro se guardan **cifrados** (AES-256) y solo se descifran para el Excel y el panel de pagos.
- Los comprobantes (de compradores y de tus pagos) van a un bucket **privado**: solo el dueño y tú pueden abrirlos, con enlaces temporales.

## 6. Pruebas automáticas (ya corridas, todas en verde)

- `npm test`: 34 pruebas (plazos, compra y vencimiento, comprobantes y confirmación, tienda y código, confirmación automática, órdenes vencidas, saldos y pagos, recordatorios, foto > S/ 50, más las de las Fases 1 y 2).
- `node test/e2e.mjs`: 53 pasos de extremo a extremo con tres sesiones (comprador/admin, vendedora y tienda), del carrito al pago del vendedor.

## 7. Si algo falla

- **"No se pudo iniciar la compra" / "Esta compra ya no acepta comprobantes"**: falta pegar `0003_fase3.sql` completo (la versión más nueva).
- **La tienda no ve órdenes**: su usuario no está asignado en /admin → Tiendas, o la orden aún no tiene el pago confirmado.
- **No llega el Excel**: solo se envía si hay pagos pendientes ese día. Puedes descargarlo cuando quieras en /admin → Pagos a vendedores.
- **Un vendedor no aparece en el Excel**: no registró datos de cobro (está en la hoja "Sin datos de cobro" y ya se le avisó).
- **Los correos no salen**: /admin → 📈 Precios y tareas → "Ejecutar ahora" fuerza el envío de los pendientes; si sigue, revisa `RESEND_API_KEY` en Vercel.
