import Link from 'next/link';
import { APP_NAME, ADMIN_EMAIL } from '@/lib/config';

export const metadata = { title: 'Términos de uso' };

export default function Terminos() {
  return (
    <main className="legal">
      <p className="small"><Link href="/">← Volver</Link></p>
      <h1>Términos de uso de {APP_NAME}</h1>
      <p className="small muted">Última actualización: 30 de septiembre de 2026. Este texto es un borrador inicial y puede actualizarse; los cambios importantes se avisarán en la app.</p>
      <h2>1. El servicio</h2>
      <p>{APP_NAME} (poketcg.pe) es una aplicación para registrar, organizar y ubicar colecciones de cartas del juego Pokémon Trading Card Game. Es un proyecto independiente sin afiliación con Nintendo, Creatures Inc., GAME FREAK ni The Pokémon Company; los nombres e imágenes de las cartas pertenecen a sus dueños y se muestran solo con fines de identificación.</p>
      <h2>2. Tu cuenta</h2>
      <p>Para usar la app necesitas una cuenta con datos verídicos (nombres, correo, celular y DNI). Eres responsable de mantener tu contraseña en secreto y de todo lo que se haga con tu cuenta. Debes tener al menos 18 años o contar con autorización de tus padres o tutores.</p>
      <h2>3. Uso permitido</h2>
      <p>Puedes usar la app para tu colección personal. No está permitido usarla para fines ilegales, intentar acceder a datos de otros usuarios, sobrecargar el servicio o copiar el catálogo de forma masiva para otros productos.</p>
      <h2>4. Tus datos y tu colección</h2>
      <p>Tu colección es tuya: puedes exportarla en cualquier momento desde Ajustes y pedir que eliminemos tu cuenta escribiendo a {ADMIN_EMAIL}. Cómo tratamos tus datos personales se explica en la <Link href="/privacidad">política de privacidad</Link>.</p>
      <h2>5. Precios y catálogo</h2>
      <p>Los precios de mercado provienen de fuentes públicas (TCGplayer y Cardmarket a través de TCGdex) y son referenciales: pueden estar desactualizados o no existir para algunas cartas. El catálogo se actualiza periódicamente y puede contener errores; agradecemos que nos los reportes.</p>
      <h2>6. Disponibilidad y responsabilidad</h2>
      <p>Hacemos lo posible por mantener el servicio disponible y tus datos seguros, pero la app se ofrece «tal cual», sin garantías. No somos responsables por pérdidas derivadas del uso de la app (por ejemplo, decisiones de compra o venta basadas en los precios mostrados). Te recomendamos exportar respaldos de tu colección con regularidad.</p>
      <h2>7. Cambios y contacto</h2>
      <p>Podemos actualizar estos términos; si sigues usando la app después de un cambio, lo aceptas. Dudas o reclamos: {ADMIN_EMAIL}.</p>
    </main>
  );
}
