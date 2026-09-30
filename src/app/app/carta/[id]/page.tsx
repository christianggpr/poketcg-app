import { CartaDetalle } from '@/components/vistas/CartaDetalle';

export const metadata = { title: 'Carta' };

export default async function PaginaCarta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CartaDetalle id={decodeURIComponent(id)} />;
}
