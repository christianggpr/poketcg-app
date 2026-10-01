// App Android (APK): datos del archivo que deja el flujo de GitHub Actions en public/descargas/ (solo servidor).
import fs from 'node:fs';
import path from 'node:path';

export type AppAndroid = { version: string; codigo: number; bytes: number; sha256: string; fecha: string; paquete: string; url: string; tamano: string };

/** Devuelve los datos del APK publicado, o null si todavía no se ha construido. */
export function appAndroid(): AppAndroid | null {
  try {
    const ruta = path.join(process.cwd(), 'public', 'descargas', 'android.json');
    if (!fs.existsSync(ruta) || !fs.existsSync(path.join(process.cwd(), 'public', 'descargas', 'poketcg.apk'))) return null;
    const d = JSON.parse(fs.readFileSync(ruta, 'utf8')) as Omit<AppAndroid, 'url' | 'tamano'>;
    if (!d.version || !d.bytes) return null;
    const mb = d.bytes / (1024 * 1024);
    return { ...d, url: '/descargas/poketcg.apk', tamano: mb >= 1 ? `${mb.toFixed(1).replace('.0', '')} MB` : `${Math.round(d.bytes / 1024)} KB` };
  } catch { return null; }
}
