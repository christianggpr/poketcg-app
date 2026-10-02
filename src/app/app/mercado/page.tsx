import { Suspense } from 'react';
import { Mercado } from '@/components/vistas/Mercado';

export const metadata = { title: 'Mercado · Explorar' };

/** Mejoras 5 · D: el Mercado abre en "Explorar" (el catálogo con buscador y filtros); los destacados van arriba de la cuadrícula. */
export default function PaginaMercado() {
  return <Suspense><Mercado /></Suspense>;
}
