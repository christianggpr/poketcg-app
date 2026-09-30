import Link from 'next/link';
import { APP_NAME, ADMIN_EMAIL } from '@/lib/config';

export const metadata = { title: 'Política de privacidad' };

export default function Privacidad() {
  return (
    <main className="legal">
      <p className="small"><Link href="/">← Volver</Link></p>
      <h1>Política de privacidad de {APP_NAME}</h1>
      <p className="small muted">Última actualización: 30 de septiembre de 2026. Este texto es un borrador inicial y puede actualizarse.</p>
      <h2>1. Qué datos recogemos</h2>
      <ul>
        <li><b>Datos de tu cuenta:</b> nombres, apellidos, correo electrónico, número de celular, DNI, nombre de usuario y contraseña (guardada cifrada; nunca podemos verla).</li>
        <li><b>Tu colección:</b> las cartas que registras, sus cajas, álbumes, cantidades, notas y fechas.</li>
        <li><b>Datos técnicos:</b> los necesarios para que la app funcione (sesión iniciada, dispositivo y navegador, registros de errores).</li>
      </ul>
      <h2>2. Para qué los usamos</h2>
      <p>Para crear y proteger tu cuenta, verificar tu correo, guardar y sincronizar tu colección entre tus dispositivos, mostrarte precios y estadísticas, y responder a tus consultas. El DNI y el celular sirven para identificar de forma única a cada persona y evitar cuentas duplicadas; en fases futuras (compra y venta entre usuarios) servirán para dar confianza a las transacciones.</p>
      <h2>3. Qué ven los demás usuarios</h2>
      <p><b>Tu DNI, tu celular, tu correo y cualquier dato de cobro nunca se muestran a otros usuarios.</b> Solo tu nombre de usuario y tus nombres podrían mostrarse en funciones sociales o de intercambio, cuando existan y tú decidas usarlas.</p>
      <h2>4. Dónde se guardan y quién los ve</h2>
      <p>Los datos se guardan en servidores de Supabase (región São Paulo, Brasil) y la app se sirve desde Vercel. Los correos se envían mediante Resend. Estos proveedores actúan por encargo nuestro y no usan tus datos para sus propios fines. Solo el administrador de {APP_NAME} tiene acceso a los datos de las cuentas, y únicamente para operar el servicio.</p>
      <h2>5. Conservación</h2>
      <p>Conservamos tus datos mientras tengas cuenta. Si la eliminas, borramos tu perfil y tu colección en un plazo máximo de 30 días, salvo que la ley nos obligue a conservar algo más tiempo.</p>
      <h2>6. Tus derechos</h2>
      <p>Conforme a la Ley N.º 29733 (Ley de Protección de Datos Personales del Perú) puedes acceder, rectificar, exportar, oponerte al tratamiento o pedir la eliminación de tus datos escribiendo a {ADMIN_EMAIL} desde el correo de tu cuenta. Desde Ajustes puedes editar tu perfil y exportar tu colección en cualquier momento.</p>
      <h2>7. Cookies</h2>
      <p>Usamos únicamente las cookies necesarias para mantener tu sesión iniciada. No usamos cookies de publicidad ni de seguimiento.</p>
      <h2>8. Contacto</h2>
      <p>Responsable: {APP_NAME} (poketcg.pe). Correo: {ADMIN_EMAIL}.</p>
    </main>
  );
}
