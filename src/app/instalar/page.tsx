import Link from 'next/link';
import { APP_NAME } from '@/lib/config';
import { appAndroid } from '@/lib/descargas';
import { InstalarApp } from '@/components/portada/InstalarApp';

export const metadata = { title: 'Instalar la app' };
export const dynamic = 'force-dynamic';

/** Página pública para instalar la app (APK de Android o desde el navegador); enlazada desde Ajustes. */
export default function Instalar() {
  const apk = appAndroid();
  return (
    <main className="legal">
      <p className="small"><Link href="/">← Volver</Link></p>
      <h1>Instala {APP_NAME} en tu celular</h1>
      <InstalarApp apk={apk} compacto />
      <h2>¿Qué diferencia hay?</h2>
      <ul>
        <li><b>App para Android (.apk)</b>: se instala como cualquier app, con icono y pantalla completa. Es la misma {APP_NAME} de la web envuelta en una app oficial de Chrome, así que se actualiza sola y no ocupa casi espacio.</li>
        <li><b>Instalar desde el navegador</b>: en Chrome o Edge (Android y PC) pulsa «Instalar»; en iPhone, Compartir → Añadir a pantalla de inicio. Mismo resultado, sin descargar archivos.</li>
      </ul>
      <p className="small muted">Si Android bloquea la instalación, ve a Ajustes → Apps → Acceso especial → Instalar apps desconocidas y permite a tu navegador o gestor de archivos. El archivo solo se descarga desde poketcg.pe.</p>
    </main>
  );
}
