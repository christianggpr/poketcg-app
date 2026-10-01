import { redirect } from 'next/navigation';

/** La app abre en Mi Colección → Álbumes (Mejoras 1 · B). Se conservan los parámetros (?bienvenida=1, ?clave=ok, ?q=…). */
export default async function PaginaApp({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') qs.set(k, v);
  const destino = sp.q ? '/app/buscar' : '/app/album';
  redirect(qs.toString() ? `${destino}?${qs}` : destino);
}
