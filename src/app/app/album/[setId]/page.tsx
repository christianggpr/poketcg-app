import { Suspense } from 'react';
import { AlbumColeccion } from '@/components/vistas/Albumes';

export const metadata = { title: 'Álbum' };

export default async function PaginaAlbum({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  return <Suspense><AlbumColeccion setId={decodeURIComponent(setId)} /></Suspense>;
}
