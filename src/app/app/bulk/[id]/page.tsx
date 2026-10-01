import { Suspense } from 'react';
import { CajaDetalle } from '@/components/vistas/Cajas';

export const metadata = { title: 'Bulk' };

export default async function PaginaBulkDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><CajaDetalle id={id} /></Suspense>;
}
