'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nombreCarta, nombreColeccion, type Carta } from '@/lib/catalogo';
import type { Destacada } from '@/lib/mercado';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from './CatalogoProvider';
import { usePerfil } from './PerfilProvider';
import { Thumb } from './Thumb';
import { Icono, type NombreIcono } from './Icono';

/**
 * Carrusel en loop (Mejoras 1 · D): se desplaza solo y de forma continua, también con el dedo o el mouse;
 * se pausa al tocar o pasar el mouse y respeta "reducir movimiento" del sistema (entonces no se mueve solo).
 * Las tarjetas se duplican para que el final enlace con el principio sin saltos.
 */
export function CarruselMercado({ titulo, icono, items, testid, vacio, nota }: { titulo: string; icono: NombreIcono; items: Destacada[]; testid: string; vacio: string; nota?: string }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const router = useRouter();
  const pista = useRef<HTMLDivElement>(null);
  const [pausado, setPausado] = useState(false);
  const [reducir, setReducir] = useState(false);
  const idioma = perfil.idioma_nombres;
  const tarjetas = items.map(d => ({ d, c: cat.carta(d.carta_id) })).filter((x): x is { d: Destacada; c: Carta } => !!x.c);
  const enLoop = tarjetas.length >= 3;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setReducir(mq.matches);
    f(); mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  useEffect(() => {
    const el = pista.current;
    if (!el || reducir || pausado || !enLoop) return;
    let id = 0, ultimo = 0, pos = el.scrollLeft;   // pos acumula fracciones de píxel (scrollLeft puede redondear)
    const paso = (t: number) => {
      if (ultimo) {
        const dt = Math.min(50, t - ultimo);
        if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft;   // el usuario lo movió con el dedo o el mouse
        pos += (dt / 1000) * 28;   // 28 px por segundo
        const mitad = el.scrollWidth / 2;
        if (pos >= mitad) pos -= mitad;   // segunda copia → vuelve a la primera sin salto
        el.scrollLeft = pos;
      }
      ultimo = t;
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [reducir, pausado, enLoop, tarjetas.length]);

  const lista = enLoop ? [...tarjetas, ...tarjetas] : tarjetas;
  return (
    <section className="carrusel" data-testid={testid} data-loop={enLoop ? '1' : '0'} data-pausado={pausado ? '1' : '0'}>
      <div className="carrusel-cabecera"><h3><Icono n={icono} /> {titulo}</h3>{nota ? <span className="small muted nota">{nota}</span> : null}</div>
      {!tarjetas.length ? <p className="small muted">{vacio}</p> : (
        <div className="pista" ref={pista} onPointerEnter={() => setPausado(true)} onPointerLeave={() => setPausado(false)} onTouchStart={() => setPausado(true)} onTouchEnd={() => setTimeout(() => setPausado(false), 1500)} onFocus={() => setPausado(true)} onBlur={() => setPausado(false)}>
          {lista.map(({ d, c }, i) => { const set = cat.setOf(c); return (
            <button key={d.carta_id + ':' + i} className="tarjeta" onClick={() => router.push(`/app/carta/${encodeURIComponent(c.id)}#mercado`)} aria-hidden={i >= tarjetas.length} tabIndex={i >= tarjetas.length ? -1 : 0} data-testid={i < tarjetas.length ? `${testid}-item` : undefined}>
              <Thumb carta={c} set={set} className="lg" />
              <span className="nombre">{nombreCarta(c, idioma)}</span>
              <span className="set small muted">{set?.ab || nombreColeccion(set, idioma, true)} {c.l}</span>
              <span className="precio">{d.copias > 1 && d.hasta && d.hasta !== d.desde ? 'desde ' : ''}{fmtPen(d.desde)}</span>
              <span className="small muted">{d.copias} {d.copias === 1 ? 'copia' : 'copias'}{d.vendidas ? ` · ${d.vendidas} ${d.vendidas === 1 ? 'vendida' : 'vendidas'}` : d.deseadas ? ` · ${d.deseadas} en listas de deseos` : ''}</span>
            </button>
          ); })}
        </div>
      )}
    </section>
  );
}
