import { CajaDetalle } from '@/components/vistas/Cajas';

export const metadata = { title: 'Caja' };

export default async function PaginaCaja({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CajaDetalle id={id} />;
}
