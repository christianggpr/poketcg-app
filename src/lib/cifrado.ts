// Cifrado simétrico (AES-256-GCM) para datos de cobro. La clave sale de DATOS_COBRO_KEY o, si no
// existe, se deriva de la clave de servicio de Supabase (que ya es secreta y solo vive en el servidor).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function clave(): Buffer {
  const base = process.env.DATOS_COBRO_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('Falta la clave para cifrar los datos de cobro');
  return createHash('sha256').update('poketcg-datos-cobro:' + base).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64');
}

export function descifrar(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', clave(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}
