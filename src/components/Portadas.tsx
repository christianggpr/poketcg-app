'use client';
import { useEffect, useId, useState } from 'react';
import type { Coleccion } from '@/lib/catalogo';
import { nombreColeccion, urlsLogo, urlSimbolo } from '@/lib/catalogo';
import { EMBLEMA, PATRON_POR_ID, esPatron, type IdMarcaAgua, type IdPatron } from '@/lib/patrones';
import { colorPastelDe, colorPortada, marcaAgua, textoSobre } from '@/lib/portadas';
import { usePerfil } from './PerfilProvider';

// Mejoras 3 · A: portadas de los álbumes.
//  · Álbum de colección: logo oficial (TCGdex → pokemontcg.io → símbolo + nombre) centrado sobre un color suave.
//  · Álbum personalizado: color elegido con el emblema PokéTCG (o un patrón) como marca de agua y el nombre encima.

/** Emblema PokéTCG: carpeta con anillas y una estrella (dibujo propio). */
export function Emblema({ tam = 110, className = '', style }: { tam?: number; className?: string; style?: React.CSSProperties }) {
  const e = EMBLEMA;
  return (
    <svg aria-hidden="true" width={tam} height={tam} viewBox="0 0 100 100" className={className} style={style}>
      <rect x={e.carpeta.x} y={e.carpeta.y} width={e.carpeta.ancho} height={e.carpeta.alto} rx={e.carpeta.radio} fill="none" stroke="currentColor" strokeWidth={e.carpeta.grosor} />
      {e.anillas.map(a => <circle key={a.cy} cx={a.cx} cy={a.cy} r={5} fill="currentColor" />)}
      <path d={e.estrella} fill="currentColor" />
    </svg>
  );
}

/** Mosaico de un patrón (trazo en `currentColor`), inclinado 12°; `escala` = tamaño del mosaico (1 = 64 px). */
export function PatronMosaico({ patron, escala = 1, opacidad = 1, className = '', style }: { patron: IdPatron; escala?: number; opacidad?: number; className?: string; style?: React.CSSProperties }) {
  const id = useId().replace(/:/g, '');
  const p = PATRON_POR_ID[patron];
  const lado = 64 * escala;
  return (
    <svg aria-hidden="true" width="100%" height="100%" className={className} style={{ opacity: opacidad, ...style }}>
      <defs>
        <pattern id={`patron-${id}`} width={lado} height={lado} patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <g transform={`scale(${(lado / 60).toFixed(4)})`}>
            {p.trazos.map((t, i) => <path key={i} d={t.d} fill="none" stroke="currentColor" strokeWidth={t.grosor ?? 2.4} strokeLinecap="round" strokeLinejoin="round" />)}
            {p.circulos?.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="currentColor" />)}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#patron-${id})`} />
    </svg>
  );
}

/** Logo oficial de la colección con respaldo: mientras carga (y si ninguna fuente carga), símbolo + nombre. */
export function LogoColeccion({ set, idioma }: { set: Coleccion; idioma: 'es' | 'en' | 'ja' }) {
  const fuentes = urlsLogo(set);
  const [i, setI] = useState(0);
  const [cargado, setCargado] = useState(false);
  useEffect(() => { setI(0); setCargado(false); }, [set.id]);
  const simbolo = urlSimbolo(set);
  return (
    <>
      {i < fuentes.length ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="logo-coleccion" src={fuentes[i]} alt={nombreColeccion(set, idioma, true)} decoding="async" style={cargado ? undefined : { display: 'none' }} onLoad={() => setCargado(true)} onError={() => { setCargado(false); setI(n => n + 1); }} data-testid="logo-coleccion" />
      ) : null}
      {!cargado ? (
        <span className="logo-texto" data-testid="logo-texto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {simbolo ? <img className="setsym" src={simbolo} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : null}
          <span className="nombre-logo">{nombreColeccion(set, idioma, true)}</span>
          {set.rg === 'ja' ? <span className="small muted">{set.sn}</span> : null}
        </span>
      ) : null}
    </>
  );
}

/** Portada de un álbum de colección: logo centrado sobre un fondo de color suave. */
export function PortadaColeccion({ set, className = '' }: { set: Coleccion; className?: string }) {
  const { perfil } = usePerfil();
  return (
    <div className={`album-cover portada-coleccion ${className}`} style={{ background: colorPastelDe(set) }} data-testid="portada-coleccion">
      <span className="caja-logo"><LogoColeccion set={set} idioma={perfil.idioma_nombres} /></span>
    </div>
  );
}

/** Portada de un álbum personalizado: color elegido, marca de agua y nombre (texto con contraste ≥ 4.5:1). */
export function PortadaPropia({ nombre, color, marca, grande = false, className = '', subtitulo }: { nombre: string; color?: string | null; marca?: IdMarcaAgua | string | null; grande?: boolean; className?: string; subtitulo?: string }) {
  const fondo = colorPortada(color);
  const m = marcaAgua(marca);
  const texto = textoSobre(fondo);
  const tam = grande ? 170 : 110;
  return (
    <div className={`album-cover portada-propia ${grande ? 'grande' : ''} ${texto.sombreado ? 'sombreada' : ''} ${className}`} style={{ background: fondo, color: texto.color }} data-testid="portada-propia" data-color={fondo} data-marca={m}>
      {m === 'emblema' ? <Emblema tam={tam} className="marca-emblema" /> : esPatron(m) ? <PatronMosaico patron={m} escala={grande ? 1 : 0.7} className="marca-patron" /> : null}
      <span className="nombre-portada">{nombre || 'Mi álbum'}{subtitulo ? <span className="sub-portada">{subtitulo}</span> : null}</span>
    </div>
  );
}
