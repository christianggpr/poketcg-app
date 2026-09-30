'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Carta, Coleccion } from '@/lib/catalogo';
import { matchesType, nombreCarta, nombreColeccion, ordenarCartas } from '@/lib/catalogo';
import type { Entrada } from '@/lib/coleccion';
import { fmtPen } from '@/lib/precios-core';
import { IDIOMAS_CARTA } from '@/lib/config';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { SimboloSet } from '../CardRow';
import { Thumb } from '../Thumb';
import { LocChip } from '../Ubicacion';
import { FilterBar, type Filtro } from '../FilterBar';
import { usePedirPrecios } from '../Precio';
import { Confirmar } from '../Sheet';
import { AddEntrySheet } from '../AddEntrySheet';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { Campo } from '../ui';

/** Idioma de una entrada para agrupar álbumes: JP para colecciones japonesas, el registrado o "—". */
function idiomaAlbum(e: Entrada, set: Coleccion | undefined): string {
  if (set?.rg === 'ja') return 'JP';
  return e.idioma || '—';
}

type AlbumAuto = { set: Coleccion; idioma: string; entradas: Entrada[]; distintas: number; total: number; portada: Carta | undefined };

function useAlbumesAuto(): AlbumAuto[] {
  const cat = useCatalogo();
  const col = useColeccion();
  return useMemo(() => {
    const m = new Map<string, AlbumAuto>();
    for (const e of col.entradas) {
      const c = cat.carta(e.carta_id);
      if (!c) continue;
      const set = cat.setOf(c);
      if (!set) continue;
      const idioma = idiomaAlbum(e, set);
      const key = set.id + '|' + idioma;
      let a = m.get(key);
      if (!a) { a = { set, idioma, entradas: [], distintas: 0, total: cat.cartasDe(set.id).filter(c => !c.sd).length, portada: undefined }; m.set(key, a); }
      a.entradas.push(e);
    }
    for (const a of m.values()) {
      const ids = new Set(a.entradas.map(e => e.carta_id));
      a.distintas = ids.size;
      const propias = cat.cartasDe(a.set.id).filter(c => ids.has(c.id));
      a.portada = propias.find(c => c.c === 'P' && (c.r || '').match(/rare|secret|illustration|ultra|hyper/i)) || propias[0];
    }
    return [...m.values()].sort((a, b) => (b.set.d || '').localeCompare(a.set.d || '') || a.idioma.localeCompare(b.idioma));
  }, [cat, col.entradas]);
}

export function Albumes() {
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const router = useRouter();
  const albumes = useAlbumesAuto();
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState(''); const [paginas, setPaginas] = useState(10); const [columnas, setColumnas] = useState(3); const [filas, setFilas] = useState(3);
  const idioma = perfil.idioma_nombres;
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Mis álbumes físicos</h2>
        <button className="btn primary sm" onClick={() => setNuevo(true)}>+ Nuevo álbum</button>
      </div>
      <p className="small muted">Un álbum físico es una carpeta con páginas de bolsillos (por ejemplo 3 × 3). Asigna a cada bolsillo la carta que va ahí para saber qué tienes y qué falta, página por página.</p>
      {col.albumes.length ? (
        <div className="album-grid">
          {col.albumes.map(a => (
            <Link key={a.id} href={`/app/album/p/${a.id}`} className="album-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="album-body"><div className="album-title">📒 {a.nombre}</div><div className="small muted">{a.paginas} páginas de {a.columnas} × {a.filas} · {a.paginas * a.columnas * a.filas} bolsillos{a.descripcion ? ` · ${a.descripcion}` : ''}</div></div>
            </Link>
          ))}
        </div>
      ) : <p className="muted small">Aún no tienes álbumes físicos.</p>}

      <h2 style={{ marginTop: 22 }}>Álbumes por colección</h2>
      <p className="small muted">Se crean solos con cada colección de la que tengas al menos una carta (uno por idioma). Las cartas que faltan se ven en gris oscuro.</p>
      {!albumes.length ? <div className="empty"><div className="big">📒</div>Cuando guardes cartas aparecerán aquí sus colecciones.</div> : null}
      <div className="album-grid">
        {albumes.map(a => {
          const pct = a.total ? Math.round((a.distintas / a.total) * 100) : 0;
          return (
            <Link key={a.set.id + a.idioma} href={`/app/album/${encodeURIComponent(a.set.id)}?idioma=${encodeURIComponent(a.idioma)}`} className="album-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="album-cover"><Thumb carta={a.portada} set={a.set} className="lg" /></div>
              <div className="album-body">
                <div className="album-title"><SimboloSet setId={a.set.id} /> {nombreColeccion(a.set, idioma)} {a.idioma === '—' ? <span className="pill" title="Cartas registradas sin idioma">sin idioma</span> : !(a.idioma === 'JP' && a.set.rg === 'ja') ? <span className="pill">{a.idioma}</span> : null}</div>
                <div className="small muted">{a.distintas} de {a.total} · {pct} %</div>
                <div className="bar" style={{ marginTop: 6 }}><div style={{ width: pct + '%' }} /></div>
              </div>
            </Link>
          );
        })}
      </div>
      {nuevo ? (
        <Sheet titulo="Nuevo álbum físico" onClose={() => setNuevo(false)} pie={<><button className="btn" onClick={() => setNuevo(false)}>Cancelar</button><button className="btn primary" onClick={async () => { const a = await col.crearAlbum({ nombre, paginas, columnas, filas }); if (a) { toast('Álbum creado', 'ok'); setNuevo(false); router.push(`/app/album/p/${a.id}`); } }}>Crear</button></>}>
          <Campo label="Nombre">{id => <input id={id} className="input" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Álbum 151, Carpeta azul…" />}</Campo>
          <div className="row wrap">
            <Campo label="Páginas">{id => <input id={id} className="input" type="number" min={1} max={300} value={paginas} onChange={e => setPaginas(Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 1)))} />}</Campo>
            <Campo label="Columnas por página">{id => <input id={id} className="input" type="number" min={1} max={6} value={columnas} onChange={e => setColumnas(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />}</Campo>
            <Campo label="Filas por página">{id => <input id={id} className="input" type="number" min={1} max={6} value={filas} onChange={e => setFilas(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />}</Campo>
          </div>
          <p className="small muted">Ej.: una carpeta de 3 × 3 con 20 páginas tiene {3 * 3 * 20} bolsillos. Podrás cambiarlo después.</p>
        </Sheet>
      ) : null}
    </div>
  );
}

/** Álbum automático de una colección (en un idioma): todas las cartas, las que faltan en gris. */
export function AlbumColeccion({ setId }: { setId: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const params = useSearchParams();
  const router = useRouter();
  const idiomaAlb = params.get('idioma') || '';
  const [f, setF] = useState<Filtro>({ sort: 'set', type: '', lang: '' });
  const [modo, setModo] = useState<'todas' | 'tengo' | 'faltan'>('todas');
  const [agregar, setAgregar] = useState<Carta | null>(null);
  const [consultarFaltan, setConsultarFaltan] = useState(false);
  const [idiomaNuevo, setIdiomaNuevo] = useState('ES');
  const [asignando, setAsignando] = useState(false);
  const [confirmarVenta, setConfirmarVenta] = useState(false);
  const toast = useToast();
  const set = cat.coleccion(setId);
  const idioma = perfil.idioma_nombres;
  const cartas = useMemo(() => (set ? cat.cartasDe(set.id) : []), [cat, set]);
  const propias = useMemo(() => {
    const m = new Map<string, Entrada[]>();
    for (const e of col.entradas) {
      if (!e.carta_id || !set) continue;
      const c = cat.carta(e.carta_id);
      if (!c || c.s !== set.id) continue;
      if (idiomaAlb && idiomaAlbum(e, set) !== idiomaAlb) continue;
      const l = m.get(e.carta_id) || []; l.push(e); m.set(e.carta_id, l);
    }
    return m;
  }, [col.entradas, cat, set, idiomaAlb]);
  const idsPropias = useMemo(() => [...propias.keys()], [propias]);
  const idsFaltan = useMemo(() => cartas.filter(c => !propias.has(c.id) && !c.sd).map(c => c.id), [cartas, propias]);
  usePedirPrecios(consultarFaltan ? [...idsPropias, ...idsFaltan] : idsPropias);

  const stats = useMemo(() => {
    let valor = 0, faltaPen = 0, faltaConPrecio = 0;
    for (const [id, es] of propias) { const c = cat.carta(id); if (!c || c.sd) continue; for (const e of es) valor += precios.precioDefecto(c, e.acabado).pen * e.cantidad; }
    for (const id of idsFaltan) { const c = cat.carta(id); if (!c) continue; const d = precios.precioDefecto(c, ''); faltaPen += d.pen; if (d.mercado) faltaConPrecio++; }
    return { valor: Math.round(valor * 100) / 100, faltaPen: Math.round(faltaPen * 100) / 100, faltaConPrecio };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [propias, idsFaltan, cat, precios.version]);

  if (!set) return <div className="empty">Esa colección no existe. <Link href="/app/album">Volver</Link></div>;
  const sinIdioma = idiomaAlb === '—' ? [...propias.values()].flat() : [];
  async function asignarIdioma() {
    setAsignando(true);
    const n = await col.editarVarias(sinIdioma.map(e => e.id), { idioma: idiomaNuevo });
    setAsignando(false);
    toast(`${n} ${n === 1 ? 'carta marcada' : 'cartas marcadas'} como ${idiomaNuevo}`, 'ok');
    router.replace(`/app/album/${encodeURIComponent(set!.id)}?idioma=${encodeURIComponent(idiomaNuevo)}`);
  }
  const sinPublicar = [...propias.values()].flat().filter(e => !col.publicacionDe(e.id));
  async function ponerEnVenta() {
    setAsignando(true);
    const n = await col.publicarVarias(sinPublicar.map(e => e.id));
    setAsignando(false);
    if (n) toast(`${n} ${n === 1 ? 'carta publicada' : 'cartas publicadas'} con el precio por defecto`, 'ok', 3500); else toast('No se publicó ninguna carta', 'danger');
  }
  const total = cartas.filter(c => !c.sd).length;
  const pct = total ? Math.round((idsPropias.length / total) * 100) : 0;
  const priceOf = (c: Carta) => precios.precioDefecto(c, propias.get(c.id)?.[0]?.acabado || '').pen;
  let lista = cartas.filter(c => matchesType(c, f.type) || (!f.type));
  if (modo === 'tengo') lista = lista.filter(c => propias.has(c.id));
  if (modo === 'faltan') lista = lista.filter(c => !propias.has(c.id));
  lista = f.sort === 'set' ? lista : ordenarCartas(cat, lista, f.sort, idioma, { priceOf });

  return (
    <div>
      <p className="small"><Link href="/app/album">← Álbumes</Link></p>
      <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <SimboloSet setId={set.id} />
        <h2 style={{ margin: 0 }}>{nombreColeccion(set, idioma, true)}{idiomaAlb && idiomaAlb !== '—' ? <span className="pill" style={{ marginLeft: 8 }}>{idiomaAlb}</span> : null}</h2>
      </div>
      <div className="stat" style={{ margin: '10px 0' }}>
        <div className="box"><b>{idsPropias.length} / {total}</b><span>cartas · {pct} % completo</span></div>
        <div className="box"><b>{fmtPen(stats.valor)}</b><span>valor de lo que tienes</span></div>
        <div className="box"><b>{consultarFaltan ? fmtPen(stats.faltaPen) : '—'}</b><span>{consultarFaltan ? `para completar (${stats.faltaConPrecio} con precio de mercado)` : <button className="link" onClick={() => setConsultarFaltan(true)}>Consultar el precio de las que faltan</button>}</span></div>
      </div>
      <div className="bar" style={{ marginBottom: 10 }}><div style={{ width: pct + '%' }} /></div>
      {sinIdioma.length ? (
        <div className="notice info" style={{ marginBottom: 10 }}>
          Estas {sinIdioma.length} {sinIdioma.length === 1 ? 'carta no tiene' : 'cartas no tienen'} idioma registrado. Si todas son del mismo idioma, márcalo aquí y este álbum se unirá con el de ese idioma:
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <select className="input sm" value={idiomaNuevo} onChange={e => setIdiomaNuevo(e.target.value)}>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select>
            <button className="btn sm primary" disabled={asignando} onClick={asignarIdioma}>{asignando ? 'Guardando…' : `Marcar todas como ${idiomaNuevo}`}</button>
          </div>
        </div>
      ) : null}
      {idsPropias.length ? <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {sinPublicar.length ? <button className="btn sm" disabled={asignando} onClick={() => setConfirmarVenta(true)}>🏷️ Poner en venta lo que tengo de esta colección ({sinPublicar.length})</button> : <span className="small muted">🏷️ Todo lo que tienes de esta colección está en el mercado.</span>}
        <Link href="/app/ventas" className="btn sm ghost">Mis ventas</Link>
      </div> : null}
      <FilterBar f={f} onChange={setF} sorts={['set', 'name', 'type', 'value', 'dex']} extra={<div className="seg"><button className={modo === 'todas' ? 'active' : ''} onClick={() => setModo('todas')}>Todas</button><button className={modo === 'tengo' ? 'active' : ''} onClick={() => setModo('tengo')}>Tengo</button><button className={modo === 'faltan' ? 'active' : ''} onClick={() => setModo('faltan')}>Faltan</button></div>} />
      <div className="album-cells">
        {lista.map(c => {
          const es = propias.get(c.id) || [];
          const qty = es.reduce((n, e) => n + e.cantidad, 0);
          const d = c.sd ? null : precios.precioDefecto(c, es[0]?.acabado || '');
          return (
            <div key={c.id} className={`album-cell ${qty ? '' : 'missing'}`} role="button" tabIndex={0} onClick={() => { if (qty) router.push(`/app/carta/${encodeURIComponent(c.id)}`); else setAgregar(c); }}>
              <div className="album-img"><Thumb carta={c} set={set} className="album" />{qty ? <span className="album-qty">×{qty}</span> : null}{es.some(e => col.publicacionDe(e.id)?.estado === 'activa') ? <span className="album-venta" title="En venta en el mercado">🏷️</span> : null}</div>
              <div className="album-num">{c.l}{c.sd ? ' · sin datos' : ''}</div>
              <div className="album-name">{nombreCarta(c, idioma)}</div>
              <div className="album-foot">{qty ? <span className="album-loc"><LocChip loc={ubicador.ubicacion(es[0])} corto /></span> : <span className="album-miss">falta</span>}{d ? <span className={`price ${d.origen === 'piso' ? 'piso' : ''}`}>{fmtPen(d.pen)}</span> : null}</div>
            </div>
          );
        })}
      </div>
      {agregar ? <AddEntrySheet carta={agregar} idiomaInicial={idiomaAlb !== '—' ? idiomaAlb : ''} onClose={() => setAgregar(null)} /> : null}
      {confirmarVenta ? <Confirmar titulo="Poner en venta" texto={`Se publicarán en el mercado ${sinPublicar.length} ${sinPublicar.length === 1 ? 'carta' : 'cartas'} de ${nombreColeccion(set, idioma, true)} con el precio por defecto (el mayor entre el piso y el valor de mercado). Podrás cambiar precios, pausar o retirar cuando quieras; las de más de S/ 50 quedan pausadas hasta que les agregues una foto.`} okLabel="Publicar" onOk={() => { setConfirmarVenta(false); ponerEnVenta(); }} onClose={() => setConfirmarVenta(false)} /> : null}
    </div>
  );
}
