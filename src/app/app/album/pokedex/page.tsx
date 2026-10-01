import { Pokedex } from '@/components/vistas/Pokedex';

// Mejoras 4 · C: álbum virtual Pokédex (una casilla por especie, en orden nacional)
export const metadata = { title: 'Pokédex' };

export default function PaginaPokedex() {
  return <Pokedex />;
}
