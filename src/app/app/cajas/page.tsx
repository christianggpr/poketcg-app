import { redirect } from 'next/navigation';

/** Dirección antigua: las cajas ahora se llaman Bulk (Mejoras 1 · C1). */
export default function PaginaCajasAntigua() {
  redirect('/app/bulk');
}
