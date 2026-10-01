import { Suspense } from 'react';
import { Mercado } from '@/components/vistas/Mercado';

export const metadata = { title: 'Buscar en el mercado' };

export default function PaginaMercadoBuscar() {
  return <Suspense><Mercado /></Suspense>;
}
