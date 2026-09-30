import Link from 'next/link';
import { APP_NAME, ADMIN_EMAIL } from '@/lib/config';
import { datosLegales } from '@/lib/legal';

export const metadata = { title: 'Términos y condiciones' };
export const dynamic = 'force-dynamic';

export default async function Terminos() {
  const { comisionPct, pagos, diasPagoTexto } = await datosLegales();
  const metodos = pagos.metodos.length ? pagos.metodos.join(' o ') : 'Yape o Plin';
  return (
    <main className="legal" data-testid="terminos">
      <p className="small"><Link href="/">← Volver</Link></p>
      <h1>Términos y condiciones de {APP_NAME}</h1>
      <p className="small muted">Última actualización: 30 de septiembre de 2026. Este texto puede actualizarse; los cambios importantes se avisarán en la app. Las cifras (comisión, plazos y días de pago) son las vigentes y se muestran también al comprar y vender.</p>

      <h2>1. Qué es {APP_NAME}</h2>
      <p>{APP_NAME} (poketcg.pe) es una aplicación para registrar, organizar y ubicar colecciones de cartas del juego Pokémon Trading Card Game, y un <b>mercado entre coleccionistas</b> donde los usuarios compran y venden cartas entre sí. {APP_NAME} <b>actúa como intermediario</b>: pone en contacto a comprador y vendedor, recibe el pago en custodia, coordina la entrega en una tienda aliada y paga al vendedor cuando la entrega se confirma. {APP_NAME} no es el vendedor de las cartas ni garantiza su autenticidad o estado más allá de lo descrito en estos términos.</p>
      <p>Es un proyecto independiente sin afiliación con Nintendo, Creatures Inc., GAME FREAK ni The Pokémon Company; los nombres e imágenes de las cartas pertenecen a sus dueños y se muestran solo con fines de identificación.</p>

      <h2>2. Tu cuenta</h2>
      <p>Para usar la app necesitas una cuenta con datos verídicos (nombres, correo, celular y DNI o carné de extranjería). Eres responsable de mantener tu contraseña en secreto y de todo lo que se haga con tu cuenta. Debes tener al menos 18 años; los menores solo pueden usar la app con autorización y bajo la responsabilidad de sus padres o tutores. Podemos suspender cuentas con datos falsos, duplicadas o que incumplan estos términos.</p>
      <p>Las <b>cuentas de tienda</b> pertenecen a los encargados de los puntos de entrega aliados y solo sirven para registrar la recepción y el retiro de las cartas.</p>

      <h2>3. Uso permitido</h2>
      <p>Puedes usar la app para tu colección personal y para comprar y vender cartas dentro del mercado. No está permitido usarla para fines ilegales, vender cartas falsas o robadas, manipular precios, intentar acceder a datos de otros usuarios, sobrecargar el servicio o copiar el catálogo de forma masiva para otros productos.</p>

      <h2>4. Tu colección y tus datos</h2>
      <p>Tu colección es tuya: puedes exportarla en cualquier momento desde Ajustes y pedir que eliminemos tu cuenta escribiendo a {ADMIN_EMAIL}. Cómo tratamos tus datos personales se explica en la <Link href="/privacidad">política de privacidad</Link>.</p>

      <h2>5. Precios de referencia y catálogo</h2>
      <p>Los precios de mercado provienen de fuentes públicas (TCGplayer y Cardmarket a través de TCGdex) convertidos a soles con el tipo de cambio del día; son referenciales y pueden estar desactualizados. El catálogo se actualiza periódicamente y puede contener errores; agradecemos que nos los reportes.</p>

      <h2>6. Vender en el mercado</h2>
      <ul>
        <li>Solo puedes publicar cartas que tienes físicamente en tu colección registrada. Describe con honestidad el idioma, la variante y el estado de conservación; las fotos deben ser de la carta real.</li>
        <li>Puedes usar el <b>precio por defecto</b> (calculado a partir del precio de mercado, con un mínimo) o fijar un precio manual. Las publicaciones de más de <b>S/ 50</b> necesitan una foto real para activarse; si el precio de mercado sube y supera ese monto, la publicación se pausa hasta que agregues la foto.</li>
        <li>Puedes pausar o retirar una publicación cuando quieras, salvo las copias que ya estén reservadas o vendidas.</li>
        <li>Al venderse una copia te comprometes a <b>dejarla en la tienda elegida por el comprador antes de la fecha límite</b> (punto 8). Si no lo haces, la orden se anula, el comprador recibe su dinero de vuelta y la falta queda registrada; las faltas repetidas pueden suspender tu cuenta de vendedor.</li>
      </ul>

      <h2>7. Comprar en el mercado</h2>
      <ul>
        <li>Al agregar una carta al carrito, la copia queda <b>reservada 24 horas</b> para ti. Al pulsar «Comprar» eliges la tienda donde la recogerás y se crea un pago con una orden por cada vendedor.</li>
        <li>Pagas el total por <b>{metodos}</b> al número de {APP_NAME} y subes la foto del comprobante <b>dentro de {pagos.reserva_min} minutos</b>; si no llega a tiempo, la reserva se libera. El administrador verifica cada pago antes de confirmarlo. Un comprobante falso o adulterado cancela la compra y bloquea la cuenta.</li>
        <li>Si el pago se rechaza, las cartas vuelven al mercado y, si ya habías pagado algo, te lo devolvemos por el mismo medio.</li>
      </ul>

      <h2>8. Entrega en tienda y código de retiro</h2>
      <ul>
        <li>El vendedor deja las cartas en la tienda elegida. <b>Fecha límite:</b> si el pago se confirma de domingo a jueves, el sábado de esa misma semana; si se confirma viernes o sábado, el sábado de la semana siguiente. La fecha exacta aparece en cada orden.</li>
        <li>La tienda registra la recepción («En tienda»). Desde ese momento tienes en la app un <b>código de retiro de 6 dígitos</b>: muéstralo solo a la tienda al recoger tus cartas y no lo compartas con nadie.</li>
        <li>Revisa las cartas al recogerlas y marca «Entregado» en la app (o lo hará la tienda con tu código). Si pasan <b>{pagos.confirmacion_dias} días</b> desde «En tienda» sin novedad, la orden se confirma automáticamente.</li>
        <li>Las tiendas custodian las cartas de buena fe mientras están en su local; su responsabilidad se limita al valor pagado por la orden.</li>
      </ul>

      <h2>9. Comisión y pagos a los vendedores</h2>
      <ul>
        <li>{APP_NAME} cobra una <b>comisión del {comisionPct} %</b> sobre el precio de cada carta vendida. La paga el vendedor: se descuenta del monto que recibe. El comprador paga exactamente el precio publicado; no hay costo de envío.</li>
        <li>El neto del vendedor queda <b>disponible cuando la entrega se confirma</b>{pagos.liberacion_dias > 0 ? ` (${pagos.liberacion_dias} ${pagos.liberacion_dias === 1 ? 'día' : 'días'} después)` : ''} y se paga a sus <b>datos de cobro</b> (Yape, Plin o transferencia bancaria a su nombre) el siguiente día de pago: <b>{diasPagoTexto}</b>. Sin datos de cobro registrados, el pago espera hasta que los agregues en Ajustes.</li>
        <li>Cada pago se registra con su número de operación y, cuando corresponde, el comprobante, visible en Mis ventas → Mi saldo.</li>
      </ul>

      <h2>10. Problemas, devoluciones y disputas</h2>
      <ul>
        <li>Si al recoger tus cartas falta alguna, es distinta a la publicada o está dañada, <b>no marques «Entregado»</b>: escríbenos a {ADMIN_EMAIL} o por WhatsApp dentro del plazo de {pagos.confirmacion_dias} días desde «En tienda», con fotos. Retendremos el pago al vendedor mientras se resuelve.</li>
        <li>Según el caso, te devolvemos el dinero por {metodos}, coordinamos la entrega correcta o descontamos la parte que falte. Una vez confirmada la entrega (por ti o automáticamente) no hay devoluciones, salvo fraude comprobado.</li>
        <li>{APP_NAME} media de buena fe entre comprador y vendedor y decide con la información disponible (fotos, registros de la tienda y de la app). Los vendedores que entreguen cartas distintas a lo publicado pueden ser suspendidos.</li>
        <li>Reclamos: {ADMIN_EMAIL}. Puedes solicitar el Libro de Reclamaciones al mismo correo; los atendemos en el plazo que fija la ley.</li>
      </ul>

      <h2>11. Disponibilidad y responsabilidad</h2>
      <p>Hacemos lo posible por mantener el servicio disponible y tus datos seguros, pero la app se ofrece «tal cual», sin garantías. Fuera de lo previsto en el punto 10, no somos responsables por pérdidas derivadas del uso de la app (por ejemplo, decisiones de compra o venta basadas en los precios de referencia). Te recomendamos exportar respaldos de tu colección con regularidad.</p>

      <h2>12. Cambios y contacto</h2>
      <p>Podemos actualizar estos términos; si sigues usando la app después de un cambio, lo aceptas. Dudas o reclamos: {ADMIN_EMAIL}.</p>
    </main>
  );
}
