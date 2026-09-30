import { MazoDetalle } from '@/components/vistas/Mazos';

export const metadata = { title: 'Mazo' };

export default async function PaginaMazo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MazoDetalle id={parseInt(id, 10)} />;
}
