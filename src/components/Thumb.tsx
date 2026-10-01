'use client';
import { useState } from 'react';
import type { Carta, Coleccion } from '@/lib/catalogo';
import { idiomaImagen, nombreColeccion, numLabel, urlsImagen, urlsImagenGrande } from '@/lib/catalogo';

type Props = {
  carta?: Carta | null;
  set?: Coleccion;
  className?: string;
  alt?: string;
  /** Idioma de la entrada o del álbum ('ES' → imagen en español si existe; lo demás, inglés / japonés). */
  idioma?: string | null;
  /** Imagen grande (al abrir la carta); si no carga, se prueban las pequeñas. */
  grande?: boolean;
  /** Carga inmediata (imagen principal de la pantalla) en vez de diferida. */
  prioridad?: boolean;
};

/**
 * Miniatura de una carta. Prueba en orden las direcciones de imagen del catálogo (TCGdex en el idioma pedido,
 * pokemontcg.io, otra fuente guardada en el catálogo…) y, si ninguna existe, muestra una casilla gris con el
 * nombre, el número y la colección en texto grande (nunca "sin foto").
 */
export function Thumb({ carta, set, className = '', alt = '', idioma, grande = false, prioridad = false }: Props) {
  const lang = idiomaImagen(idioma);
  const urls = carta ? (grande ? urlsImagenGrande(carta, set, lang) : urlsImagen(carta, set, lang)) : [];
  // El índice de la URL en uso se reinicia si cambia la carta (las listas reutilizan el componente)
  const clave = `${carta ? carta.id : ''}|${lang}|${grande ? 'g' : 'p'}`;
  const [estado, setEstado] = useState({ clave, i: 0 });
  const i = estado.clave === clave ? estado.i : 0;
  const src = urls[i];
  if (!src) return <TextoCarta carta={carta} set={set} className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`thumb ${className}`} loading={prioridad ? 'eager' : 'lazy'} decoding="async" src={src} alt={alt} onError={() => setEstado({ clave, i: i + 1 })} data-fuente={i} />;
}

/** Casilla gris con nombre, número y colección: para las cartas sin imagen en ninguna fuente pública. */
export function TextoCarta({ carta, set, className = '' }: { carta?: Carta | null; set?: Coleccion; className?: string }) {
  if (!carta) return <span className={`thumb thumb-texto ${className}`} aria-hidden="true" />;
  const nombre = carta.ns || carta.n;
  const col = nombreColeccion(set, 'es');
  return (
    <span className={`thumb thumb-texto ${className}`} role="img" aria-label={`${nombre} · ${numLabel(carta, set)} · ${col}`} data-testid="carta-sin-imagen">
      <span className="tt-num">{carta.l}</span>
      <span className="tt-nombre">{nombre}</span>
      {carta.nj && carta.nj !== nombre ? <span className="tt-nombre-jp">{carta.nj}</span> : null}
      <span className="tt-col">{col}</span>
    </span>
  );
}
