'use client';
import { Icono } from '../Icono';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Carta } from '@/lib/catalogo';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { analizarVariante, construirIndice, idsFaltantes, type AnalisisCarta, type AnalisisVariante } from '@/lib/mazos-cliente';
import { diferencias, type Arquetipo, type Variante } from '@/lib/mazos-core';
import { cargarMazos, urlIcono } from '@/lib/mazos-datos';
import { ofertasDe, resumenMercado, type ResumenCarta } from '@/lib/mercado';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { useMercado } from '../MercadoProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { Thumb } from '../Thumb';
import { useToast } from '../Toast';
import { Aviso } from '../ui';

type Datos = { arquetipos: Arquetipo[]; variantes: Variante[]; actualizado: string | null };

function useMazos() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { cargarMazos().then(setDatos).catch(e => setError((e as Error).message)); }, []);
  return { datos, error };
}

function Iconos({ iconos, tam = 36 }: { iconos: string[]; tam?: number }) {
  return <span className="row" style={{ gap: 2 }}>{iconos.slice(0, 3).map(i => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={urlIcono(i)} alt="" width={tam} height={tam} style={{ objectFit: 'contain' }} onError={e => { e.currentTarget.style.display = 'none'; }} />)}</span>;
}

/** Costo aproximado de lo que falta (precio por defecto de la misma impresión o del equivalente más reciente). */
function usarCosto(precios: ReturnType<typeof usePrecios>, a: AnalisisVariante | null): { pen: number; conPrecio: number } {
  if (!a) return { pen: 0, conPrecio: 0 };
  let pen = 0, conPrecio = 0;
  for (const c of a.cartas) {
    if (!c.faltan) continue;
    const ref = c.misma || c.equivalentes[0];
    if (!ref) continue;
    const d = precios.precioDefecto(ref, '');
    pen += d.pen * c.faltan; if (d.mercado) conPrecio++;
  }
  return { pen: Math.round(pen * 100) / 100, conPrecio };
}

/** Lista de mazos meta con el % que tengo de la variante más completa de cada uno. */
export function Mazos() {
  const cat = useCatalogo();
  const col = useColeccion();
  const precios = usePrecios();
  const { datos, error } = useMazos();
  const indice = useMemo(() => construirIndice(cat), [cat]);
  const analisis = useMemo(() => {
    if (!datos) return new Map<number, { variante: Variante; a: AnalisisVariante }[]>();
    const m = new Map<number, { variante: Variante; a: AnalisisVariante }[]>();
    for (const v of datos.variantes) { const l = m.get(v.arquetipo_id) || []; l.push({ variante: v, a: analizarVariante(cat, indice, v.cartas, col.entradas) }); m.set(v.arquetipo_id, l); }
    return m;
  }, [datos, cat, indice, col.entradas]);
  const mejores = useMemo(() => {
    const m = new Map<number, { variante: Variante; a: AnalisisVariante }>();
    for (const [id, l] of analisis) { const mejor = l.slice().sort((x, y) => y.a.pct - x.a.pct || (x.variante.mejor_puesto ?? 999) - (y.variante.mejor_puesto ?? 999))[0]; if (mejor) m.set(id, mejor); }
    return m;
  }, [analisis]);
  useEffect(() => {
    const ids = new Set<string>();
    for (const { a } of mejores.values()) for (const id of idsFaltantes(a)) ids.add(id);
    if (ids.size) precios.pedir([...ids].slice(0, 600));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [mejores]);
  const sugeridos = datos ? datos.arquetipos.filter(a => (mejores.get(a.id)?.a.pct || 0) >= 50) : [];

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h2 style={{ margin: 0 }}>Mazos del meta</h2>
        <div className="row" style={{ gap: 6 }}><Link href="/app/mercado" className="btn sm ghost"><Icono n="tienda" /> Mercado</Link><Link href="/app/carrito" className="btn sm ghost">Carrito</Link></div>
      </div>
      <p className="small muted">Los mazos que más ganan en torneos (formato estándar, últimos 3 meses, según Limitless) y cuánto tienes de cada uno con tus cartas. Se actualizan cada día.{datos?.actualizado ? ` Última actualización: ${new Date(datos.actualizado).toLocaleDateString('es-PE')}.` : ''}</p>
      {error ? <Aviso tipo="danger">No se pudieron cargar los mazos: {error}</Aviso> : null}
      {!datos && !error ? <p className="muted small"><span className="spinner" /> Cargando mazos…</p> : null}
      {datos && !datos.arquetipos.length ? <div className="empty"><div className="big"><Icono n="mazos" tam={44} grosor={1.5} /></div><p><b>Todavía no hay mazos.</b></p><p className="muted">La tarea diaria los descarga de Limitless a medianoche (o el administrador puede ejecutarla ahora desde /admin).</p></div> : null}
      {sugeridos.length ? (
        <div className="notice ok" style={{ margin: '10px 0' }} data-testid="sugerencia-mazos">
          <b>¡Ya vas por buen camino!</b> {sugeridos.map(a => { const m = mejores.get(a.id)!; return <span key={a.id} style={{ display: 'block' }}>Con <b>{a.nombre}</b> ({m.variante.nombre}) tienes el <b>{m.a.pct} %</b>: te faltan {m.a.faltan} cartas. <Link href={`/app/mazos/${a.id}`}>Ver qué falta</Link></span>; })}
        </div>
      ) : null}
      <div className="card-list" style={{ marginTop: 10 }}>
        {datos?.arquetipos.map(a => {
          const m = mejores.get(a.id);
          const costo = usarCosto(precios, m?.a || null);
          const nVar = analisis.get(a.id)?.length || 0;
          return (
            <Link key={a.id} href={`/app/mazos/${a.id}`} className="card-row" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="fila-mazo">
              <div style={{ width: 34, textAlign: 'center', fontWeight: 800, color: 'var(--texto-2)' }}>{a.orden}</div>
              <Iconos iconos={a.iconos} />
              <div className="card-main">
                <div className="card-name">{a.nombre}</div>
                <div className="card-set">{a.cuota != null ? `${a.cuota} % del meta` : ''}{nVar ? ` · ${nVar} ${nVar === 1 ? 'variante' : 'variantes'}` : ''}</div>
                {m ? <div className="small" style={{ marginTop: 3 }}><b>Tienes el {m.a.pct} %</b> ({m.a.tengo}/{m.a.total} cartas){m.a.faltan ? <span className="muted"> · te faltan {m.a.faltan} ≈ {fmtPen(costo.pen)}</span> : <span className="pill ok" style={{ marginLeft: 6 }}>¡completo!</span>}</div> : null}
                {m ? <div className="bar" style={{ marginTop: 4, maxWidth: 260 }}><div style={{ width: m.a.pct + '%' }} /></div> : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Detalle de un arquetipo: variantes, qué tengo, diferencias y "Comprar lo que me falta". */
export function MazoDetalle({ id }: { id: number }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const mercado = useMercado();
  const toast = useToast();
  const { datos, error } = useMazos();
  const indice = useMemo(() => construirIndice(cat), [cat]);
  const arquetipo = datos?.arquetipos.find(a => a.id === id);
  const variantes = useMemo(() => (datos?.variantes.filter(v => v.arquetipo_id === id) || []).map(v => ({ variante: v, a: analizarVariante(cat, indice, v.cartas, col.entradas) })), [datos, id, cat, indice, col.entradas]);
  const mejor = useMemo(() => variantes.slice().sort((x, y) => y.a.pct - x.a.pct || (x.variante.mejor_puesto ?? 999) - (y.variante.mejor_puesto ?? 999))[0], [variantes]);
  const [sel, setSel] = useState<string | null>(null);
  const actual = variantes.find(v => v.variante.id === sel) || mejor;
  const [enRed, setEnRed] = useState<Map<string, ResumenCarta>>(new Map());
  const [comprando, setComprando] = useState(false);
  const [resultado, setResultado] = useState<string>('');
  const idsFalta = useMemo(() => (actual ? idsFaltantes(actual.a) : []), [actual]);
  useEffect(() => { if (idsFalta.length) precios.pedir(idsFalta.slice(0, 600)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [idsFalta]);
  useEffect(() => {
    if (!idsFalta.length) { setEnRed(new Map()); return; }
    let vivo = true;
    resumenMercado({ cartas: idsFalta.slice(0, 500), limite: 500, orden: 'precio' }).then(r => { if (vivo) setEnRed(new Map(r.map(x => [x.carta_id, x]))); }).catch(() => {});
    return () => { vivo = false; };
  }, [idsFalta, mercado.version]);
  const costo = usarCosto(precios, actual?.a || null);

  if (error) return <Aviso tipo="danger">No se pudieron cargar los mazos: {error}</Aviso>;
  if (!datos) return <p className="muted small"><span className="spinner" /> Cargando…</p>;
  if (!arquetipo || !actual) return <div className="empty">Ese mazo no existe. <Link href="/app/mazos">Volver a mazos</Link></div>;

  const disponibleEnRed = (c: AnalisisCarta) => { const ids = [c.misma, ...c.equivalentes].filter((x): x is Carta => !!x).map(x => x.id); let copias = 0, min = Infinity; for (const i of ids) { const r = enRed.get(i); if (r) { copias += r.copias; min = Math.min(min, r.precio_min); } } return copias ? { copias, min } : null; };
  const faltantes = actual.a.cartas.filter(c => c.faltan);
  const enVenta = faltantes.filter(c => disponibleEnRed(c));

  async function comprarFaltantes() {
    setComprando(true);
    let agregadas = 0, sinOferta = 0, parciales = 0;
    for (const c of faltantes) {
      let necesito = c.faltan;
      const ids = [c.misma, ...c.equivalentes].filter((x): x is Carta => !!x).map(x => x.id);   // misma impresión primero
      for (const cid of ids) {
        if (!necesito) break;
        if (!enRed.get(cid)) continue;
        const ofertas = await ofertasDe(cid).catch(() => []);
        for (const o of ofertas) {
          if (!necesito) break;
          if (o.vendedor_id === perfil.id) continue;
          const enCarrito = mercado.carrito.find(l => l.publicacion_id === o.id)?.cantidad || 0;
          const n = Math.min(necesito, o.disponibles);
          const r = await mercado.reservar(o.id, enCarrito + n);
          if (r.ok) { agregadas += n; necesito -= n; }
        }
      }
      if (necesito === c.faltan) sinOferta++; else if (necesito > 0) parciales++;
    }
    setComprando(false);
    const partes = [`${agregadas} ${agregadas === 1 ? 'copia agregada' : 'copias agregadas'} al carrito`];
    if (parciales) partes.push(`${parciales} ${parciales === 1 ? 'carta solo en parte' : 'cartas solo en parte'}`);
    if (sinOferta) partes.push(`${sinOferta} ${sinOferta === 1 ? 'carta no está' : 'cartas no están'} en venta en la red`);
    setResultado(partes.join(' · '));
    toast(agregadas ? `${agregadas} copias reservadas en tu carrito` : 'Ninguna de las cartas que faltan está en venta ahora', agregadas ? 'ok' : '');
  }

  const grupos: { titulo: string; cat: 'P' | 'T' | 'E' }[] = [{ titulo: 'Pokémon', cat: 'P' }, { titulo: 'Entrenador', cat: 'T' }, { titulo: 'Energía', cat: 'E' }];
  const dif = actual.variante.id !== mejor.variante.id ? diferencias(mejor.variante.cartas, actual.variante.cartas) : [];

  return (
    <div>
      <p className="small"><Link href="/app/mazos">← Mazos meta</Link></p>
      <div className="row" style={{ alignItems: 'center', gap: 10 }}><Iconos iconos={arquetipo.iconos} tam={48} /><div><h2 style={{ margin: 0 }}>{arquetipo.nombre}</h2><div className="small muted">Puesto {arquetipo.orden} del meta{arquetipo.cuota != null ? ` · ${arquetipo.cuota} %` : ''} · {variantes.length} {variantes.length === 1 ? 'variante' : 'variantes'}</div></div></div>

      <h3 style={{ marginBottom: 6 }}>Variantes</h3>
      <div className="card-list">
        {variantes.map(({ variante: v, a }) => (
          <div key={v.id} className={`card-row ${actual.variante.id === v.id ? 'activa' : ''}`} role="button" tabIndex={0} onClick={() => setSel(v.id)} style={{ outline: actual.variante.id === v.id ? '2px solid var(--primario)' : undefined }} data-testid="variante">
            <div className="card-main">
              <div className="card-name">{v.nombre}{v.id === mejor.variante.id ? <span className="pill ok" style={{ marginLeft: 6 }}>la más completa para ti</span> : null}</div>
              <div className="card-set">{v.n_listas} {v.n_listas === 1 ? 'lista' : 'listas'}{v.mejor_puesto ? ` · mejor puesto ${v.mejor_puesto}º` : ''}{v.jugador ? ` · ${v.jugador}` : ''}</div>
              <div className="small" style={{ marginTop: 3 }}><b>Tienes el {a.pct} %</b> ({a.tengo}/{a.total}){a.faltan ? ` · faltan ${a.faltan}` : ''}</div>
              <div className="bar" style={{ marginTop: 4, maxWidth: 260 }}><div style={{ width: a.pct + '%' }} /></div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 12 }} data-testid="resumen-variante">
        <h3 style={{ marginTop: 0 }}>{actual.variante.nombre}</h3>
        <div className="stat">
          <div className="box"><b>{actual.a.pct} %</b><span>tienes {actual.a.tengo} de {actual.a.total}</span></div>
          <div className="box"><b>{actual.a.faltan}</b><span>cartas te faltan</span></div>
          <div className="box"><b>{fmtPen(costo.pen)}</b><span>costo aprox. de lo que falta{costo.conPrecio < faltantes.length ? ' (algunas al precio piso)' : ''}</span></div>
        </div>
        {actual.a.pct >= 50 && actual.a.faltan ? <Aviso tipo="ok">Ya tienes más de la mitad: con {actual.a.faltan} cartas más (≈ {fmtPen(costo.pen)}) completas esta variante.</Aviso> : null}
        {faltantes.length ? (
          <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" disabled={comprando || !enVenta.length} onClick={comprarFaltantes} data-testid="btn-comprar-faltantes">{comprando ? 'Reservando…' : `Comprar lo que me falta (${enVenta.length} de ${faltantes.length} en venta)`}</button>
            {resultado ? <span className="small" data-testid="resultado-compra">{resultado} · <Link href="/app/carrito">Ver carrito</Link></span> : null}
          </div>
        ) : <Aviso tipo="ok">¡Tienes todas las cartas de esta variante!</Aviso>}
        {dif.length ? <div className="small" style={{ marginTop: 8 }}><b>Diferencias con {mejor.variante.nombre}:</b> {dif.map(d => `${d.delta > 0 ? '+' : ''}${d.delta} ${d.carta.nombre}`).join(', ')}</div> : null}
      </div>

      {grupos.map(g => {
        const filas = actual.a.cartas.filter(c => c.carta.cat === g.cat);
        if (!filas.length) return null;
        return (
          <div key={g.cat} style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 6 }}>{g.titulo} <span className="muted">({filas.reduce((n, c) => n + c.necesarias, 0)})</span></h3>
            <div className="card-list">
              {filas.map((c, i) => {
                const ref = c.misma || c.equivalentes[0] || null;
                const set = ref ? cat.setOf(ref) : undefined;
                const red = c.faltan ? disponibleEnRed(c) : null;
                return (
                  <div key={i} className={`card-row ${c.faltan ? '' : 'dim'}`} style={{ cursor: ref ? 'pointer' : 'default' }} onClick={() => { if (ref) window.location.href = `/app/carta/${encodeURIComponent(ref.id)}`; }} data-testid="carta-mazo">
                    <Thumb carta={ref} set={set} />
                    <div className="card-main">
                      <div className="card-name">{c.necesarias}× {ref ? nombreCarta(ref, perfil.idioma_nombres) : c.carta.nombre} <span className="muted small">{c.carta.set} {c.carta.num}</span></div>
                      <div className="card-set">{ref ? <>{nombreColeccion(set, perfil.idioma_nombres)} <span className="num">{numLabel(ref, set)}</span></> : <span className="faint">no está en el catálogo</span>}{c.usadas.filter(u => u.carta !== c.misma).length ? <span className="faint"> · usas {c.usadas.filter(u => u.carta !== c.misma).map(u => `${u.n} de ${nombreColeccion(cat.setOf(u.carta), perfil.idioma_nombres)}`).join(', ')}</span> : null}</div>
                      <div className="small" style={{ marginTop: 2 }}>{c.faltan ? <><span className="pill warn">te faltan {c.faltan}</span> {red ? <span className="pill ok">{red.copias} en la red desde {fmtPen(red.min)}</span> : <span className="faint">nadie la vende ahora</span>}</> : <span className="pill ok"><Icono n="ok" tam={12} /> tienes {c.tengo}</span>}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
