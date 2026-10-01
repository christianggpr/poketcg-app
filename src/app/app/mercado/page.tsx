import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { MercadoInicio } from '@/components/vistas/MercadoInicio';

export const metadata = { title: 'Mercado' };

/** Inicio del Mercado. Los enlaces antiguos con filtros (?q=, ?set=, ?faltan=1) van a Buscar en el mercado. */
export default async function PaginaMercado({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') qs.set(k, v);
  if (sp.q || sp.set || sp.faltan) redirect(`/app/mercado/buscar?${qs}`);
  return <Suspense><MercadoInicio /></Suspense>;
}
