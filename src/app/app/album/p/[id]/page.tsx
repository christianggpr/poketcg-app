import { AlbumFisico } from '@/components/vistas/AlbumFisico';

export const metadata = { title: 'Álbum físico' };

export default async function PaginaAlbumFisico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AlbumFisico id={id} />;
}
