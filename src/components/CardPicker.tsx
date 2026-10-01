'use client';
import { Icono } from './Icono';
import { useMemo, useState } from 'react';
import type { Carta } from '@/lib/catalogo';
import { buscarCatalogo } from '@/lib/buscar';
import { useCatalogo } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { Sheet } from './Sheet';
import { CardRow } from './CardRow';
import { useUbicador } from './useUbicador';

/** Buscador dentro de una hoja para elegir una carta del catálogo (o de tu colección). */
export function CardPicker({ titulo = 'Buscar carta', soloColeccion, onPick, onClose, onPersonalizada }: { titulo?: string; soloColeccion?: boolean; onPick: (c: Carta) => void; onClose: () => void; onPersonalizada?: () => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const ubicador = useUbicador();
  const [q, setQ] = useState('');
  const propias = useMemo(() => new Set(col.entradas.map(e => e.carta_id).filter(Boolean) as string[]), [col.entradas]);
  const resultados = useMemo(() => {
    if (!q.trim()) {
      if (!soloColeccion) return [];
      return [...propias].map(id => cat.carta(id)).filter((c): c is Carta => !!c).slice(0, 80);
    }
    const r = buscarCatalogo(cat, q, soloColeccion ? 400 : 60).map(x => x.card);
    return soloColeccion ? r.filter(c => propias.has(c.id)).slice(0, 80) : r;
  }, [q, cat, soloColeccion, propias]);
  return (
    <Sheet titulo={titulo} onClose={onClose}>
      <div className="search-wrap">
        <span className="ico"><Icono n="buscar" tam={20} /></span>
        <input className="input" autoFocus placeholder="Nombre, número (025/165), colección…" value={q} onChange={e => setQ(e.target.value)} />
        {q ? <button className="clear" onClick={() => setQ('')} aria-label="Borrar"><Icono n="cerrar" /></button> : null}
      </div>
      <div className="card-list" style={{ marginTop: 10, maxHeight: '55vh', overflow: 'auto' }}>
        {resultados.map(c => <CardRow key={c.id} carta={c} entradas={col.entradas.filter(e => e.carta_id === c.id)} ubicador={ubicador} onClick={() => onPick(c)} />)}
        {q && !resultados.length ? <div className="empty"><div className="big"><Icono n="buscar" tam={44} grosor={1.5} /></div>No hay resultados{onPersonalizada ? <div style={{ marginTop: 8 }}><button className="btn sm" onClick={onPersonalizada}>Crear carta personalizada</button></div> : null}</div> : null}
      </div>
    </Sheet>
  );
}
