import { Suspense } from 'react';
import { Mercado } from '@/components/vistas/Mercado';

export const metadata = { title: 'Mercado' };

export default function PaginaMercado() {
  return <Suspense><Mercado /></Suspense>;
}
