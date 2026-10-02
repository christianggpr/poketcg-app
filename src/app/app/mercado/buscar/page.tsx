import { redirect } from 'next/navigation';

/** Dirección antigua de "Buscar en el mercado": ahora es Explorar (/app/mercado), con los mismos parámetros. */
export default async function PaginaMercadoBuscar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') qs.set(k, v);
  redirect(`/app/mercado${qs.toString() ? '?' + qs.toString() : ''}`);
}
