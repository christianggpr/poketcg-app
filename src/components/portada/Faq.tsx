'use client';
import { Icono } from '../Icono';
import { useMemo, useState } from 'react';
import type { SeccionAyuda } from '@/lib/ayuda';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Preguntas frecuentes con buscador: cada pregunta es un <details> con ancla propia (#id). */
export function Faq({ secciones }: { secciones: SeccionAyuda[] }) {
  const [q, setQ] = useState('');
  const filtro = fold(q.trim());
  const visibles = useMemo(() => secciones.map(s => ({ ...s, preguntas: s.preguntas.filter(p => !filtro || fold(p.q + ' ' + p.a).includes(filtro)) })).filter(s => s.preguntas.length), [secciones, filtro]);
  const total = visibles.reduce((n, s) => n + s.preguntas.length, 0);
  return (
    <div data-testid="faq">
      <div className="search-wrap" style={{ marginTop: 8 }}>
        <input className="input" placeholder="Busca tu duda: código de retiro, comisión, reclamo…" value={q} onChange={e => setQ(e.target.value)} data-testid="faq-buscar" aria-label="Buscar en la ayuda" />
      </div>
      {filtro ? <p className="small muted" style={{ margin: '6px 0 0' }}>{total ? `${total} ${total === 1 ? 'respuesta' : 'respuestas'}` : 'Nada con esas palabras. Prueba con otra o escríbenos.'}</p> : null}
      {!filtro ? (
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
          {secciones.map(s => <a key={s.id} className="chip" href={'#' + s.id}><Icono n={s.icono} tam={15} /> {s.titulo}</a>)}
        </div>
      ) : null}
      {visibles.map(s => (
        <section key={s.id} id={s.id} style={{ marginTop: 18 }} data-testid="faq-seccion">
          <h2 style={{ marginBottom: 2 }}><Icono n={s.icono} tam={22} /> {s.titulo}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>{s.para}</p>
          <div className="faq-lista">
            {s.preguntas.map(p => (
              <details key={p.id} id={p.id} className="faq" open={!!filtro} data-testid="faq-pregunta">
                <summary>{p.q}</summary>
                <div className="faq-resp">{p.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
