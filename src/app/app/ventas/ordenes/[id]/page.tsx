import { OrdenVendedorDetalle } from '@/components/vistas/VentasOrdenes';

export const metadata = { title: 'Orden de venta' };

export default async function PaginaOrdenVenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrdenVendedorDetalle id={id} />;
}
