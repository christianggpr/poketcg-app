import { CompraDetalle } from '@/components/vistas/Compras';

export const metadata = { title: 'Compra' };

export default async function PaginaCompra({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompraDetalle id={id} />;
}
