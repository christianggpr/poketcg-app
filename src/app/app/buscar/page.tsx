import { Suspense } from 'react';
import { Buscar } from '@/components/vistas/Buscar';

export const metadata = { title: 'Buscar' };

export default function PaginaBuscar() {
  return <Suspense><Buscar /></Suspense>;
}
