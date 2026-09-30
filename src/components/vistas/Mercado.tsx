'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { nombreAlt, nombreCarta, nombreColeccion, numLabel, rarezaLabel, type Carta } from '@/lib/catalogo';
import { buscarCatalogo } from '@/lib/buscar';
import { ACABADOS, CONDICIONES, IDIOMAS_CARTA } from '@/lib/config';
import { resumenMercado, type OrdenMercado, type ResumenCarta } from '@/lib/mercado';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { useMercado } from '../MercadoProvider';
import { usePerfil } from '../PerfilProvider';
import { SimboloSet } from '../CardRow';
import { Thumb } from '../Thumb';
import { Aviso } from '../ui';

/** Pestaña Mercado: cartas en venta en toda la red, con búsqueda, filtros y orden. */
export function Mercado() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [set, setSet] = useState(params.get('set') || '');
  const [idioma, setIdioma] = useState('');
  const [acabado, setAcabado] = useState('');
  const [condicion, setCondicion] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [orden, setOrden] = useState<OrdenMercado>('novedad');
  const [soloFaltan, setSoloFaltan] = useState(params.get('faltan') === '1');
  const [mas, setMas] = useState(false);
  const [filas, setFilas] = useState<ResumenCarta[] | null>(null);
  const [error, setError] = useState('');
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const pedido = useRef(0);
  const idiomaN = perfil.idioma_nombres;
  const POR_PAGINA = 40;

  // ids de cartas que coinciden con el texto (la búsqueda por nombre ES/EN/JP, número y colección la hace el catálogo)
  const idsTexto = useMemo(() => {
    const t = q.trim();
    if (!t) return null;
    return buscarCatalogo(cat, t, 400).map(r => r.card.id);
  }, [cat, q]);
  const idsMias = useMemo(() => new Set(col.entradas.map(e => e.carta_id).filter((x): x is string => !!x)), [col.entradas]);
  const sets = useMemo(() => cat.sets.slice().sort((a, b) => (b.d || '').localeCompare(a.d || '')), [cat.sets]);

  useEffect(() => {
    if (idsTexto && !idsTexto.length) { setFilas([]); setHayMas(false); return; }
    const n = ++pedido.current;
    const t = setTimeout(async () => {
      try {
        const r = await resumenMercado({ cartas: idsTexto, set, idioma, acabado, condicion, min: min ? Number(min) : null, max: max ? Number(max) : null, orden, limite: POR_PAGINA + 1, desde: pagina * POR_PAGINA });
        if (n !== pedido.current) return;
        setHayMas(r.length > POR_PAGINA);
        setFilas(r.slice(0, POR_PAGINA));
        setError('');
      } catch (e) { if (n === pedido.current) setError((e as Error).message); }
    }, 250);
    return () => clearTimeout(t);
  }, [idsTexto, set, idioma, acabado, condicion, min, max, orden, pagina, mercado.version]);
  useEffect(() => { setPagina(0); }, [q, set, idioma, acabado, condicion, min, max, orden]);

  const lista = (filas || []).filter(f => !soloFaltan || !idsMias.has(f.carta_id));
  const setSel = cat.coleccion(set);

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h2 style={{ margin: 0 }}>🛒 Mercado</h2>
        <div className="row" style={{ gap: 6 }}>
          <Link href="/app/carrito" className="btn sm" data-testid="btn-carrito">🛒 Carrito{mercado.unidades ? ` (${mercado.unidades})` : ''}</Link>
          <Link href="/app/compras" className="btn sm ghost">🧾 Mis compras</Link>
          <Link href="/app/mazos" className="btn sm ghost">🃏 Mazos meta</Link>
          <Link href="/app/ventas" className="btn sm ghost">🏷️ Mis ventas</Link>
        </div>
      </div>
      <p className="small muted">Cartas que otros coleccionistas tienen en venta. El precio que ves es el que pagas por copia (la comisión la paga el vendedor). El pago en línea llega pronto; por ahora puedes armar tu carrito y las copias quedan reservadas 24 h.</p>
      <div className="search-wrap" style={{ marginTop: 8 }}>
        <input className="input" placeholder="Buscar por nombre (ES/EN/JP), número o colección…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
        <div className="seg">
          <button className={orden === 'novedad' ? 'active' : ''} onClick={() => setOrden('novedad')}>Novedad</button>
          <button className={orden === 'precio' ? 'active' : ''} onClick={() => setOrden('precio')}>Precio ↑</button>
          <button className={orden === 'valor' ? 'active' : ''} onClick={() => setOrden('valor')}>Valor ↓</button>
        </div>
        <button className={`btn sm ${mas || set || idioma || acabado || condicion || min || max ? 'primary' : ''}`} onClick={() => setMas(m => !m)}>Filtros{[set, idioma, acabado, condicion, min || max].filter(Boolean).length ? ` (${[set, idioma, acabado, condicion, min || max].filter(Boolean).length})` : ''}</button>
        <label className="check small" style={{ alignItems: 'center' }}><input type="checkbox" checked={soloFaltan} onChange={e => setSoloFaltan(e.target.checked)} /> Solo las que me faltan</label>
      </div>
      {mas ? (
        <div className="row wrap" style={{ gap: 8, marginTop: 8 }} data-testid="filtros-mercado">
          <div className="field"><label>Colección</label><select className="input" value={set} onChange={e => setSet(e.target.value)}><option value="">Todas</option>{sets.map(s => <option key={s.id} value={s.id}>{nombreColeccion(s, idiomaN, true)}{s.rg === 'ja' ? ' (JP)' : ''}</option>)}</select></div>
          <div className="field"><label>Idioma</label><select className="input" value={idioma} onChange={e => setIdioma(e.target.value)}><option value="">Todos</option>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
          <div className="field"><label>Acabado</label><select className="input" value={acabado} onChange={e => setAcabado(e.target.value)}><option value="">Todos</option>{ACABADOS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}</select></div>
          <div className="field"><label>Estado</label><select className="input" value={condicion} onChange={e => setCondicion(e.target.value)}><option value="">Todos</option>{CONDICIONES.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label>Precio desde (S/)</label><input className="input" inputMode="decimal" style={{ maxWidth: 110 }} value={min} onChange={e => setMin(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          <div className="field"><label>hasta (S/)</label><input className="input" inputMode="decimal" style={{ maxWidth: 110 }} value={max} onChange={e => setMax(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          {set || idioma || acabado || condicion || min || max ? <div className="field"><label>&nbsp;</label><button className="btn sm ghost" onClick={() => { setSet(''); setIdioma(''); setAcabado(''); setCondicion(''); setMin(''); setMax(''); }}>Limpiar filtros</button></div> : null}
        </div>
      ) : null}
      {setSel ? <p className="small" style={{ marginTop: 6 }}>Colección: <b>{nombreColeccion(setSel, idiomaN, true)}</b> <button className="link" onClick={() => setSet('')}>quitar</button></p> : null}
      {error ? <Aviso tipo="danger">No se pudo consultar el mercado: {error}</Aviso> : null}
      {filas === null && !error ? <p className="muted small" style={{ marginTop: 12 }}><span className="spinner" /> Consultando el mercado…</p> : null}
      {filas && !lista.length ? (
        <div className="empty"><div className="big">🛒</div><p><b>{q || set || idioma || acabado || condicion || min || max || soloFaltan ? 'Nada en venta con esos filtros.' : 'Todavía no hay cartas en venta.'}</b></p><p className="muted">Cuando alguien publique una carta aparecerá aquí al instante. ¿Tienes repetidas? Ponlas en venta desde tus cajas.</p></div>
      ) : null}
      <div className="card-list" style={{ marginTop: 10 }}>
        {lista.map(f => {
          const c = cat.carta(f.carta_id);
          if (!c) return null;
          return <FilaMercado key={f.carta_id} carta={c} resumen={f} tengo={idsMias.has(f.carta_id)} onClick={() => router.push(`/app/carta/${encodeURIComponent(c.id)}#mercado`)} />;
        })}
      </div>
      {filas && (pagina > 0 || hayMas) ? (
        <div className="row" style={{ gap: 6, marginTop: 10, justifyContent: 'center' }}>
          <button className="btn sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>← Anteriores</button>
          <button className="btn sm" disabled={!hayMas} onClick={() => setPagina(p => p + 1)}>Siguientes →</button>
        </div>
      ) : null}
    </div>
  );
}

function FilaMercado({ carta, resumen, tengo, onClick }: { carta: Carta; resumen: ResumenCarta; tengo: boolean; onClick: () => void }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const idioma = perfil.idioma_nombres;
  const set = cat.setOf(carta);
  const alt = nombreAlt(carta, idioma);
  return (
    <div className="card-row" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }} data-testid="fila-mercado">
      <Thumb carta={carta} set={set} />
      <div className="card-main">
        <div className="card-name">{nombreCarta(carta, idioma)}{alt ? <span className="alt"> · {alt}</span> : null}{tengo ? <span className="pill primary" style={{ marginLeft: 6 }}>la tengo</span> : null}</div>
        <div className="card-set"><SimboloSet setId={carta.s} /> {nombreColeccion(set, idioma)} <span className="num">{numLabel(carta, set)}</span>{carta.r ? <span className="faint"> · {rarezaLabel(carta.r)}</span> : null}</div>
        <div className="small" style={{ marginTop: 3 }}><b>{resumen.copias} {resumen.copias === 1 ? 'copia' : 'copias'}</b> en la red · {resumen.vendedores.map(v => '@' + v).join(', ')}{resumen.ofertas > resumen.vendedores.length ? '…' : ''}</div>
      </div>
      <div className="card-side"><span className="price">{resumen.precio_min === resumen.precio_max ? fmtPen(resumen.precio_min) : `desde ${fmtPen(resumen.precio_min)}`}</span></div>
    </div>
  );
}
