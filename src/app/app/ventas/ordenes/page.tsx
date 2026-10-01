import { redirect } from 'next/navigation';

export const metadata = { title: 'Órdenes de venta' };

/** Layout v2: las órdenes de venta viven en Mis ventas → pestaña «Por entregar» (la dirección antigua sigue funcionando). */
export default function PaginaOrdenesVenta() {
  redirect('/app/ventas?pestana=por_entregar');
}
