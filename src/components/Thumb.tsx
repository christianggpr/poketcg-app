'use client';
import { useState } from 'react';
import type { Carta, Coleccion } from '@/lib/catalogo';
import { urlsImagen } from '@/lib/catalogo';

const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 63 88"><rect width="63" height="88" rx="4" fill="#cfd6e6"/><text x="31.5" y="50" font-size="10" text-anchor="middle" fill="#6b7590" font-family="sans-serif">sin foto</text></svg>');

/** Miniatura de una carta con varias URL de respaldo. */
export function Thumb({ carta, set, className = '', alt = '' }: { carta?: Carta | null; set?: Coleccion; className?: string; alt?: string }) {
  const urls = carta ? urlsImagen(carta, set) : [];
  const [i, setI] = useState(0);
  const src = urls[i] || PLACEHOLDER;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`thumb ${className}`} loading="lazy" src={src} alt={alt} onError={() => { if (i < urls.length) setI(i + 1); }} />;
}
