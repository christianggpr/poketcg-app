// Centro de ayuda (/ayuda): preguntas frecuentes construidas con los ajustes vigentes (comisión, plazos, días de pago).
import { ADMIN_EMAIL, APP_NAME } from './config';
import type { DatosLegales } from './legal';

export type Pregunta = { id: string; q: string; a: string };
export type SeccionAyuda = { id: string; titulo: string; icono: string; para: string; preguntas: Pregunta[] };

const limpio = (s: string) => s.replace(/\s+/g, ' ').trim();

export function preguntasFrecuentes(d: DatosLegales): SeccionAyuda[] {
  const p = d.pagos;
  const metodos = p.metodos.length ? p.metodos.join(' o ') : 'Yape o Plin';
  const plazo = p.modo_limite === 'sabado' ? 'hasta el sábado de esa semana (si el pago se confirma viernes o sábado, el sábado siguiente)' : `hasta ${p.entrega_dias} días después de confirmado el pago`;
  const contacto = `Escríbenos a ${ADMIN_EMAIL}${p.whatsapp ? ` o por WhatsApp al ${p.whatsapp} (${p.atencion})` : ''}.`;
  return [
    {
      id: 'general', titulo: 'Lo básico', icono: '✨', para: 'Qué es PokéTCG, cuánto cuesta y qué datos se comparten', preguntas: [
        { id: 'que-es', q: `¿Qué es ${APP_NAME}?`, a: `Una app gratuita para registrar tu colección de cartas Pokémon TCG (en qué caja y posición está cada carta, álbumes por colección e idioma, valor de mercado) y un mercado entre coleccionistas: vendes desde tus cajas y compras con pago por ${metodos}, entrega en una tienda aliada y código de retiro. ${APP_NAME} actúa como intermediario: custodia el pago y lo entrega al vendedor cuando el comprador recoge sus cartas.` },
        { id: 'cuanto-cuesta', q: '¿Cuánto cuesta usarla?', a: `Nada. Registrar y organizar tu colección es gratis. En el mercado, el comprador paga exactamente el precio publicado (sin cargos ni envío) y el vendedor paga una comisión del ${d.comisionPct} % sobre cada carta vendida, que se descuenta de lo que recibe.` },
        { id: 'sin-cuenta', q: '¿Necesito una cuenta para ver las cartas?', a: 'No. Las fichas de carta (precio de referencia, ofertas y últimas ventas), los perfiles de los vendedores y las tiendas de entrega se ven sin cuenta. Para guardar tu colección, comprar o vender sí necesitas registrarte: pedimos nombres, correo, celular y DNI para que el mercado sea seguro (cada compra y venta queda ligada a una persona real).' },
        { id: 'privacidad', q: '¿Qué datos míos ven los demás?', a: 'Solo tu nombre de usuario (@usuario), tu reputación como vendedor y lo que publicas. Nadie —ni otros usuarios ni las tiendas— ve tu DNI, celular, correo, nombre real ni datos de cobro. Los datos de cobro se guardan cifrados y los comprobantes en un almacén privado.' },
        { id: 'app-celular', q: '¿Hay app para el celular?', a: 'Sí. En Android descarga el .apk desde la portada (o instala desde Chrome: menú ⋮ → Instalar aplicación). En iPhone: Compartir → Añadir a pantalla de inicio. Es la misma app que la web y se actualiza sola.' },
        { id: 'precios', q: '¿De dónde salen los precios de referencia?', a: 'De TCGplayer y Cardmarket (vía TCGdex), convertidos a soles con el tipo de cambio del día. Son referenciales: el precio final lo decide cada vendedor. En cada ficha también ves el promedio de las últimas ventas reales dentro de la app.' },
        { id: 'contacto', q: '¿Cómo me comunico con ustedes?', a: contacto + ' Para reclamos formales puedes pedir el Libro de Reclamaciones al mismo correo.' },
        { id: 'exportar', q: '¿Puedo llevarme mis datos o borrar mi cuenta?', a: `Sí. Exporta tu colección cuando quieras desde Ajustes (JSON o CSV). Para borrar tu cuenta escribe a ${ADMIN_EMAIL}; eliminamos tus datos salvo los que la ley obliga a conservar (por ejemplo, el registro de compras y ventas).` }
      ]
    },
    {
      id: 'compradores', titulo: 'Para compradores', icono: '🛒', para: 'Cómo pagar, cuándo recoges tus cartas y qué hacer si algo sale mal', preguntas: [
        { id: 'como-comprar', q: '¿Cómo compro una carta?', a: `Búscala en el Mercado, agrégala al carrito (la copia queda reservada 24 horas) y pulsa Comprar. Eliges la tienda donde la recogerás, pagas por ${metodos} al número de ${APP_NAME} y subes la foto del comprobante dentro de ${p.reserva_min} minutos. El administrador verifica el pago y lo confirma; desde ese momento la venta es firme.` },
        { id: 'tarjeta', q: '¿Puedo pagar con tarjeta o en efectivo?', a: `Por ahora solo por ${metodos} (y con tu saldo de ${APP_NAME}, si tienes). Estamos evaluando pagos con tarjeta.` },
        { id: 'saldo', q: `¿Qué es mi saldo de ${APP_NAME}?`, a: 'Es dinero a tu favor dentro de la app: cada vez que una compra se anula o se te devuelve algo por un reclamo, el monto cae ahí al instante. Lo usas en tu siguiente compra (se descuenta solo) o lo retiras a tu Yape, Plin o cuenta desde Mis compras; se paga el siguiente día de pago.' },
        { id: 'cuando-recojo', q: '¿Cuándo puedo recoger mis cartas?', a: `El vendedor tiene ${p.plazo_fecha_horas} horas para elegir la fecha en que las dejará en la tienda, ${plazo}. Te avisamos cuando estén en la tienda («En tienda») y desde ese momento tienes tu código de retiro en Mis compras.` },
        { id: 'codigo-retiro', q: '¿Qué es el código de retiro?', a: 'Un número de 6 dígitos que aparece en tu orden cuando las cartas ya están en la tienda. Muéstralo solo al encargado de la tienda al recogerlas: sin ese código la tienda no entrega nada. No lo compartas.' },
        { id: 'no-entrega', q: '¿Y si el vendedor no entrega?', a: `Si en ${p.plazo_fecha_horas} horas no eligió fecha, o no dejó las cartas en la fecha prometida, puedes anular la orden tú mismo desde Mis compras: el dinero vuelve a tu saldo al instante y la falta queda en la reputación del vendedor. Si no haces nada, la orden se anula sola al pasar la fecha límite.` },
        { id: 'reclamo', q: '¿Qué hago si la carta no es como la publicaron?', a: `Revísala en la tienda antes de llevártela. Si falta algo, es otra carta o está en peor estado, no te la lleves ni marques «Entregado»: abre un reclamo desde la orden con fotos (la tienda también puede registrarlo por ti). Las cartas quedan en la tienda y el administrador decide con las fotos: devolución total a tu saldo, parcial o entrega tal cual. Una vez que sales de la tienda con las cartas, o pasan ${p.confirmacion_dias} días desde «En tienda», la compra se considera aceptada.` },
        { id: 'auto-confirma', q: '¿Cuánto tiempo guarda la tienda mis cartas?', a: `Recógelas lo antes posible. Si pasan ${p.confirmacion_dias} días desde «En tienda» sin que las recojas ni reclames, la orden se confirma automáticamente y el vendedor cobra; las cartas siguen esperándote en la tienda.` },
        { id: 'calificar', q: '¿Cómo califico al vendedor?', a: 'Al confirmarse la entrega puedes dejarle de 1 a 5 estrellas y un comentario desde Mis compras; puedes corregirlo durante 7 días. Tu reseña aparece en su perfil público con tu nombre de usuario.' },
        { id: 'a-mi-coleccion', q: '¿Qué pasa con las cartas que compro?', a: 'Entran solas a tu colección en Cajas → Por colocar, con el idioma, acabado y estado de la compra. Elige la caja y la app te dice en qué posición guardarlas.' },
        { id: 'cancelar', q: '¿Puedo cancelar una compra?', a: 'Antes de pagar, sí: quita las cartas del carrito o deja que la reserva venza. Después de que el pago se confirma, solo si el vendedor incumple (ver «¿Y si el vendedor no entrega?»).' },
        { id: 'favoritos', q: '¿Qué es la lista de deseos?', a: 'Marca una carta con el corazón ❤️ en su ficha. Cuando alguien la publique te avisamos por la app y por correo (máximo un aviso al día por carta). Tus favoritas se ven arriba del Mercado.' }
      ]
    },
    {
      id: 'vendedores', titulo: 'Para vendedores', icono: '🏷️', para: 'Cómo publicar, entregar y cobrar; tu reputación', preguntas: [
        { id: 'como-vender', q: '¿Cómo vendo una carta?', a: 'Primero regístrala en una de tus cajas. Luego, desde la carta, pulsa Vender: eliges cuántas copias, el precio (por defecto a partir del precio de mercado, o manual), el idioma, el acabado y el estado. Las publicaciones de más de S/ 50 necesitan una foto real de la carta.' },
        { id: 'cuanto-cobro', q: '¿Cuánto cobro y cuándo?', a: `Recibes el precio publicado menos la comisión del ${d.comisionPct} %. El dinero queda disponible cuando el comprador recoge las cartas${p.liberacion_dias > 0 ? ` (${p.liberacion_dias} ${p.liberacion_dias === 1 ? 'día' : 'días'} después)` : ''} y se paga a tus datos de cobro (Yape, Plin o cuenta bancaria, en Ajustes) el siguiente día de pago: ${d.diasPagoTexto}. Sin datos de cobro, el pago espera hasta que los registres.` },
        { id: 'me-compraron', q: '¿Qué pasa cuando alguien me compra?', a: `Recibes un aviso con las cartas vendidas y dónde están en tu colección (ya salen de tus cajas). Tienes ${p.plazo_fecha_horas} horas para elegir la fecha en que las dejarás en la tienda que eligió el comprador, ${plazo}. Te recordamos el día anterior y el mismo día.` },
        { id: 'rotulo', q: '¿Qué es el rótulo del sobre?', a: 'Una etiqueta que la app genera para cada orden (número de orden, tu usuario, el del comprador, la tienda y las cartas). Imprímela o cópiala y pégala en el sobre: la tienda ubica el pedido al instante. El comprador igual necesita su código de retiro para llevárselo.' },
        { id: 'no-entregue', q: '¿Qué pasa si no entrego a tiempo?', a: 'La orden se anula, el comprador recupera su dinero y las cartas vuelven a tu colección, pero la falta queda registrada en tu reputación. Varias faltas en 90 días muestran una alerta en tu perfil y pueden suspender tu cuenta de vendedor.' },
        { id: 'reputacion', q: '¿Cómo funciona mi reputación?', a: 'Cada compra entregada puede recibir una reseña (1 a 5 estrellas). Con tus ventas se calculan insignias automáticas: Confirma rápido (eliges fecha en pocas horas), Cumple fechas, Sin faltas y Top vendedor. Todo se ve en tu perfil público (/u/tu-usuario) y junto a tus ofertas; puedes responder cada reseña una vez.' },
        { id: 'pausada', q: '¿Por qué mi publicación se pausó sola?', a: 'Si el precio supera S/ 50 (por tu precio o porque subió el de mercado) la publicación necesita una foto real para estar activa. Agrégala desde Mis ventas y se reactiva.' },
        { id: 'estado', q: '¿Cómo describo el estado de la carta?', a: 'Con la escala estándar: NM (casi nueva), LP (poco jugada), MP (jugada), HP (muy jugada) y DM (dañada). Al elegirla verás la descripción de cada una. Describe con honestidad: un reclamo por estado se resuelve con fotos.' },
        { id: 'falsas', q: '¿Puedo vender cartas que no tengo, falsas o de otra persona?', a: 'No. Solo cartas que están físicamente en tu colección registrada. Vender cartas falsas, robadas o que no son tuyas suspende la cuenta.' },
        { id: 'stock', q: '¿Qué pasa con la carta vendida en mi colección?', a: 'Sale de tu caja en cuanto el pago se confirma (la orden guarda en qué caja y posición estaba, para que la encuentres). Si la orden se anula o vence, vuelve a la misma caja.' },
        { id: 'reclamo-vendedor', q: '¿Qué pasa si el comprador reclama?', a: 'La orden queda en disputa y tu pago en espera. El administrador revisa las fotos y decide. Si te da la razón, cobras normalmente; si procede la devolución, las cartas quedan en la tienda para que las recojas y la orden cuenta como falta.' }
      ]
    },
    {
      id: 'tiendas', titulo: 'Tiendas de entrega', icono: '🏪', para: 'Qué hacen las tiendas aliadas y cómo ser una', preguntas: [
        { id: 'que-hace', q: '¿Qué hace una tienda aliada?', a: 'Recibe el sobre que deja el vendedor, lo guarda y se lo entrega al comprador cuando este muestra su código de retiro. La tienda tiene una cuenta en la app para registrar cada recepción y cada retiro en segundos.' },
        { id: 'cobra', q: '¿La tienda cobra por la entrega?', a: 'Depende de cada tienda: algunas cobran una pequeña tarifa de recojo que se paga en el local. Lo ves en la página de Tiendas y al elegir la tienda al comprar; si no dice nada, el recojo es gratis.' },
        { id: 'registrar', q: '¿Cómo registra la tienda una entrega?', a: 'En la pestaña Tienda: «Recibido en tienda» cuando llega el sobre (con foto opcional) y «Retirado por el comprador» escribiendo el código de retiro. Si una tienda aún no tiene cuenta, el vendedor sube una foto de la entrega y el comprador confirma al recoger.' },
        { id: 'reclamo-tienda', q: '¿Qué pasa si el comprador reclama en la tienda?', a: 'La tienda puede registrar el reclamo por él con fotos. Las cartas se quedan en la tienda hasta que el administrador resuelva; si procede la devolución, el vendedor pasa a recogerlas.' },
        { id: 've-tienda', q: '¿Qué datos ve la tienda?', a: 'Solo nombres de usuario, las cartas de la orden y el código de retiro. Nunca datos personales ni montos de pago.' },
        { id: 'ser-tienda', q: '¿Cómo se convierte mi tienda en punto de entrega?', a: `Escríbenos a ${ADMIN_EMAIL} con el nombre, dirección y horario de tu local. Te damos de alta y una cuenta de tienda; no tiene costo.` }
      ]
    }
  ].map(s => ({ ...s, preguntas: s.preguntas.map(q => ({ ...q, a: limpio(q.a) })) }));
}
