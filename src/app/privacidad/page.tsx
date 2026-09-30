import Link from 'next/link';
import { APP_NAME, ADMIN_EMAIL } from '@/lib/config';
import { datosLegales } from '@/lib/legal';

export const metadata = { title: 'Política de privacidad' };
export const dynamic = 'force-dynamic';

export default async function Privacidad() {
  const { pagos } = await datosLegales();
  const wsp = (pagos.whatsapp || pagos.yape_numero || '').replace(/\D/g, '');
  return (
    <main className="legal" data-testid="privacidad">
      <p className="small"><Link href="/">← Volver</Link></p>
      <h1>Política de privacidad de {APP_NAME}</h1>
      <p className="small muted">Última actualización: 30 de septiembre de 2026. Este texto puede actualizarse; los cambios importantes se avisarán en la app.</p>

      <h2>1. Qué datos recogemos</h2>
      <ul>
        <li><b>Datos de tu cuenta:</b> nombres, apellidos, correo electrónico, número de celular, DNI o carné de extranjería, nombre de usuario y contraseña (guardada cifrada; nunca podemos verla). El celular se verifica por WhatsApp con un código que tú nos envías.</li>
        <li><b>Tu colección:</b> las cartas que registras, sus cajas, álbumes, cantidades, notas, fotos de tus publicaciones y fechas.</li>
        <li><b>Compras y ventas:</b> órdenes, pagos, la foto del comprobante de pago y su número de operación, la tienda elegida, códigos de retiro, fotos de entrega tomadas en la tienda, fechas y estados de cada orden, y las notificaciones que te enviamos.</li>
        <li><b>Datos de cobro</b> (solo si vendes): método (Yape, Plin o banco), número, titular, banco, cuenta y CCI. Se guardan <b>cifrados</b> y solo se descifran para pagarte.</li>
        <li><b>Datos técnicos:</b> los necesarios para que la app funcione (sesión iniciada, dispositivo y navegador, registros de errores y de las tareas automáticas).</li>
      </ul>

      <h2>2. Para qué los usamos</h2>
      <p>Para crear y proteger tu cuenta, verificar tu correo y tu celular, guardar y sincronizar tu colección entre tus dispositivos, mostrarte precios y estadísticas, <b>procesar tus compras y ventas</b> (verificar pagos, coordinar la entrega con la tienda, pagar a los vendedores y resolver reclamos), <b>avisarte</b> por la app, por correo y por WhatsApp de lo que pasa con tus órdenes, prevenir fraudes (por ejemplo, comprobantes repetidos o cuentas duplicadas) y cumplir obligaciones legales y tributarias. El DNI y el celular sirven para identificar de forma única a cada persona; el nombre completo y el DNI, además, para comprobar que los datos de cobro están a tu nombre.</p>

      <h2>3. Qué ven los demás</h2>
      <ul>
        <li><b>Otros usuarios</b> solo ven tu <b>nombre de usuario</b>, tus publicaciones (carta, precio, fotos, estado) y, si compran o te compran, el estado de la orden. <b>Nunca</b> ven tu DNI, tu celular, tu correo, tu nombre real ni tus datos de cobro.</li>
        <li><b>Las tiendas aliadas</b> ven únicamente el nombre de usuario del comprador y del vendedor, las cartas de la orden y el código de retiro.</li>
        <li><b>El administrador</b> de {APP_NAME} ve los datos de las cuentas, los comprobantes de pago y, al pagar a los vendedores, sus datos de cobro (también en el archivo Excel de pagos que se genera cada día de pago). Los usa solo para operar el servicio.</li>
      </ul>

      <h2>4. Dónde se guardan y quién los procesa</h2>
      <p>Los datos se guardan en servidores de Supabase (región São Paulo, Brasil) y la app se sirve desde Vercel. Los correos se envían mediante Resend. Los avisos por WhatsApp se envían desde el número de {APP_NAME}{wsp ? ` (${wsp})` : ''} a través de WhatsApp (Meta). Estos proveedores actúan por encargo nuestro y no usan tus datos para sus propios fines. Las fotos de comprobantes de pago se guardan en un espacio privado al que solo acceden el dueño de cada archivo y el administrador.</p>

      <h2>5. Conservación</h2>
      <p>Conservamos los datos de tu cuenta y tu colección mientras tengas cuenta. Si la eliminas, borramos tu perfil, tu colección y tus publicaciones en un plazo máximo de 30 días. Los registros de compras, ventas, pagos y comprobantes se conservan el tiempo que exijan las normas tributarias y de protección al consumidor, aunque cierres tu cuenta, y luego se eliminan. Las fotos de las publicaciones se borran al completarse la venta.</p>

      <h2>6. Tus derechos</h2>
      <p>Conforme a la Ley N.º 29733 (Ley de Protección de Datos Personales del Perú) y su reglamento, puedes acceder, rectificar, exportar, oponerte al tratamiento o pedir la eliminación de tus datos escribiendo a {ADMIN_EMAIL} desde el correo de tu cuenta; respondemos en los plazos que fija la ley. Desde Ajustes puedes editar tu perfil, tus datos de cobro y exportar tu colección en cualquier momento. Si consideras que no atendimos tu pedido, puedes acudir a la Autoridad Nacional de Protección de Datos Personales.</p>

      <h2>7. Cookies</h2>
      <p>Usamos únicamente las cookies necesarias para mantener tu sesión iniciada. No usamos cookies de publicidad ni de seguimiento.</p>

      <h2>8. Contacto</h2>
      <p>Responsable: {APP_NAME} (poketcg.pe). Correo: {ADMIN_EMAIL}.</p>
    </main>
  );
}
