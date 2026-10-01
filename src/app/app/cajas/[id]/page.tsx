import { redirect } from 'next/navigation';

/** Dirección antigua de una caja: redirige al Bulk con el mismo id (enlaces y correos ya enviados siguen funcionando). */
export default async function PaginaCajaAntigua({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/bulk/${encodeURIComponent(id)}`);
}
