import Link from 'next/link';

export const metadata = { title: 'Escanear' };

export default function PaginaEscanear() {
  return (
    <div>
      <h2>Escanear</h2>
      <div className="notice info">
        <b>Búsqueda por foto: en construcción.</b> La identificación con la cámara (la misma tecnología de PokéBóveda v1: enderezado, huellas visuales y lectura del número) llegará en la siguiente entrega de la Fase 1. Mientras tanto, usa <Link href="/app">Buscar</Link> escribiendo el nombre o el número de la carta.
      </div>
    </div>
  );
}
