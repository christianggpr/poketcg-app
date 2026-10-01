'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TYPE_ES, TYPE_ORDER, nombreCarta, nombreColeccion, numLabel, idiomaImagen, urlsImagen, type Carta, type Especie } from '@/lib/catalogo';
import type { Entrada } from '@/lib/coleccion';
import { fmtPen } from '@/lib/precios-core';
import { GENERACIONES, cartaRepresentativa, cartasPorEspecie, especiesOrdenadas, generacionDe, masValiosa, numeroDex, tipoEspecie } from '@/lib/pokedex';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { usePedirPrecios } from '../Precio';
import { useUbicador } from '../useUbicador';
import { Thumb } from '../Thumb';
import { LocChip } from '../Ubicacion';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { Icono } from '../Icono';
import { Libro, type AccionLibro } from '../Libro';
import { PortadaPropia } from '../Portadas';

// Mejoras 4 · C: álbum virtual "Pokédex" (primero en la lista): una casilla por especie en orden nacional. Una casilla
// está "tengo" si tengo cualquier carta de esa especie (cualquier colección, idioma o acabado) y muestra mi carta más
// valiosa (o la que elegí: tabla pokedex_elecciones). Las que faltan muestran en gris la carta más reciente del catálogo
// con el n.º de Pokédex. No mueve cartas de lugar; no se puede borrar pero sí ocultar (perfiles.pokedex_oculto).

export const COLOR_POKEDEX = '#D23B30';

export type CeldaPokedex = {
  dex: number;
  especie: Especie;
  tipo: string;
  generacion: number;
  /** La carta que se muestra: la mía (más valiosa o elegida) o la del catálogo si falta. */
  carta: Carta | undefined;
  entrada?: Entrada;
  tengo: boolean;
  copias: number;
  /** Precio de la carta mostrada (si la tengo). */
  pen: number;
  /** La casilla muestra una carta elegida a mano. */
  elegida: boolean;
};

/** Elecciones guardadas (dex → carta) por usuario; se leen una vez por sesión. */
const cacheElecciones = new Map<string, Map<number, string>>();
const esTablaAusente = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /schema cache|does not exist|no existe/i.test(e.message || ''));

async function cargarElecciones(usuarioId: string): Promise<Map<number, string>> {
  const en = cacheElecciones.get(usuarioId);
  if (en) return en;
  const m = new Map<number, string>();
  try {
    const { data, error } = await supabaseBrowser().from('pokedex_elecciones').select('dex, carta_id');
    if (!error) for (const f of (data || []) as { dex: number; carta_id: string }[]) m.set(f.dex, f.carta_id);
  } catch { /* sin conexión: sin elecciones */ }
  cacheElecciones.set(usuarioId, m);
  return m;
}

/** Casillas de la Pokédex de este usuario (una por especie), totales y precio de lo mostrado. */
export function usePokedex() {
  const cat = useCatalogo();
  const col = useColeccion();
  const precios = usePrecios();
  const { perfil } = usePerfil();
  const toast = useToast();
  const [elecciones, setElecciones] = useState<Map<number, string>>(() => cacheElecciones.get(perfil.id) || new Map());
  useEffect(() => { let vivo = true; cargarElecciones(perfil.id).then(m => { if (vivo) setElecciones(m); }); return () => { vivo = false; }; }, [perfil.id]);
  const porEspecie = useMemo(() => cartasPorEspecie(cat), [cat]);
  const especies = useMemo(() => especiesOrdenadas(cat), [cat]);
  // mis entradas por especie (una carta con dos Pokémon cuenta para los dos)
  const propias = useMemo(() => {
    const m = new Map<number, Entrada[]>();
    for (const e of col.entradas) {
      const c = cat.carta(e.carta_id);
      if (!c || !c.dex) continue;
      for (const d of c.dex) { let l = m.get(d); if (!l) { l = []; m.set(d, l); } l.push(e); }
    }
    return m;
  }, [col.entradas, cat]);
  const idsPropias = useMemo(() => [...new Set([...propias.values()].flat().map(e => e.carta_id).filter((x): x is string => !!x))], [propias]);
  usePedirPrecios(idsPropias);
  const celdas = useMemo<CeldaPokedex[]>(() => especies.map(sp => {
    const dex = sp[0];
    const delCatalogo = porEspecie.get(dex) || [];
    const mias = propias.get(dex) || [];
    const copias = mias.reduce((n, e) => n + e.cantidad, 0);
    const valoradas = mias.map(e => { const c = cat.carta(e.carta_id)!; return { entrada: e, carta: c, pen: precios.precioDefecto(c, e.acabado).pen, fecha: cat.setOf(c)?.d || '' }; });
    const elegidaId = elecciones.get(dex);
    const elegida = elegidaId ? valoradas.find(v => v.carta.id === elegidaId) : undefined;   // solo vale si todavía la tengo
    const mejor = elegida || masValiosa(valoradas);
    return {
      dex, especie: sp, tipo: tipoEspecie(delCatalogo), generacion: generacionDe(dex),
      carta: mejor ? mejor.carta : cartaRepresentativa(cat, delCatalogo), entrada: mejor?.entrada,
      tengo: !!mejor, copias, pen: mejor ? mejor.pen : 0, elegida: !!elegida
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }), [especies, porEspecie, propias, elecciones, cat, precios.version]);
  const tengo = useMemo(() => celdas.filter(c => c.tengo).length, [celdas]);
  const valor = useMemo(() => Math.round(celdas.reduce((t, c) => t + c.pen, 0) * 100) / 100, [celdas]);

  const guardarEleccion = useCallback(async (dex: number, cartaId: string | null) => {
    const nueva = new Map(elecciones);
    if (cartaId) nueva.set(dex, cartaId); else nueva.delete(dex);
    setElecciones(nueva); cacheElecciones.set(perfil.id, nueva);
    try {
      const { error } = cartaId
        ? await supabaseBrowser().from('pokedex_elecciones').upsert({ usuario_id: perfil.id, dex, carta_id: cartaId }, { onConflict: 'usuario_id,dex' })
        : await supabaseBrowser().from('pokedex_elecciones').delete().eq('usuario_id', perfil.id).eq('dex', dex);
      if (error) toast(esTablaAusente(error) ? 'La elección se verá solo en este dispositivo hasta que se pegue 0009_mejoras4.sql en Supabase.' : 'No se pudo guardar la elección: ' + error.message, 'danger', 5000);
    } catch { toast('No se pudo guardar la elección', 'danger'); }
  }, [elecciones, perfil.id, toast]);

  return { celdas, tengo, total: celdas.length, valor, propias, guardarEleccion, oculta: !!perfil.pokedex_oculto };
}

/** Ocultar / mostrar la Pokédex en la lista de álbumes (perfiles.pokedex_oculto; si la base aún no tiene 0009, solo en este dispositivo). */
export function useOcultarPokedex() {
  const { perfil, setPerfil } = usePerfil();
  const toast = useToast();
  return useCallback(async (oculta: boolean) => {
    setPerfil({ ...perfil, pokedex_oculto: oculta });
    try {
      const { error } = await supabaseBrowser().from('perfiles').update({ pokedex_oculto: oculta }).eq('id', perfil.id);
      if (error && !(error.code === 'PGRST204' || error.code === '42703' || /column|columna/i.test(error.message || ''))) toast('No se pudo guardar: ' + error.message, 'danger');
    } catch { /* sin conexión */ }
    toast(oculta ? 'Pokédex oculta. Puedes volver a mostrarla desde Mis álbumes.' : 'Pokédex visible', 'ok');
  }, [perfil, setPerfil, toast]);
}

/** Tarjeta de la Pokédex en la lista de álbumes (siempre primera). */
export function TarjetaPokedex() {
  const { tengo, total, valor } = usePokedex();
  const pct = total ? Math.round((tengo / total) * 100) : 0;
  return (
    <Link href="/app/album/pokedex" className="album-card" data-testid="album-pokedex">
      <PortadaPropia nombre="Pokédex" color={COLOR_POKEDEX} marca="emblema" />
      <div className="album-body">
        <div className="album-title"><span className="nombre">Pokédex</span><span className="pill info">Por especie</span></div>
        <div className="bar" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: pct + '%' }} /></div>
        <div className="album-foot-card"><span>{tengo} / {total}</span><span>{fmtPen(valor)}</span></div>
      </div>
    </Link>
  );
}

/** El álbum Pokédex como libro (bloque A): filtros generación · tipo · Tengo/Faltan; casillas con mi carta o la del catálogo en gris. */
export function Pokedex() {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const ubicador = useUbicador();
  const router = useRouter();
  const ocultar = useOcultarPokedex();
  const { celdas, tengo, total, valor, propias, guardarEleccion } = usePokedex();
  const [gen, setGen] = useState(0);
  const [tipo, setTipo] = useState('');
  const [modo, setModo] = useState<'todas' | 'tengo' | 'faltan'>('todas');
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState<number | null>(null);     // casilla abierta (dex)
  const [eligiendo, setEligiendo] = useState<number | null>(null); // "Elegir otra carta para esta casilla"
  const idioma = perfil.idioma_nombres;
  const lista = useMemo(() => celdas.filter(c => (!gen || c.generacion === gen) && (!tipo || c.tipo === tipo) && (modo === 'todas' || (modo === 'tengo') === c.tengo)), [celdas, gen, tipo, modo]);
  const tengoFiltro = useMemo(() => celdas.filter(c => (!gen || c.generacion === gen) && (!tipo || c.tipo === tipo)), [celdas, gen, tipo]);
  useEffect(() => { setPagina(1); }, [gen, tipo, modo]);
  const pct = total ? Math.round((tengo / total) * 100) : 0;
  const precargar = (siguientes: CeldaPokedex[]) => { for (const c of siguientes) { if (!c.carta) continue; const u = urlsImagen(c.carta, cat.setOf(c.carta), idiomaImagen(c.entrada?.idioma))[0]; if (u) { const im = new Image(); im.decoding = 'async'; im.src = u; } } };
  const nombreEspecie = (c: CeldaPokedex) => (idioma === 'ja' ? c.especie[3] : idioma === 'es' ? c.especie[2] : c.especie[1]) || c.especie[1];

  const celda = (c: CeldaPokedex) => {
    const set = c.carta ? cat.setOf(c.carta) : undefined;
    const titulo = `N.º ${numeroDex(c.dex)} · ${nombreEspecie(c)}${c.tengo ? ` · tienes ${c.copias}${c.carta ? ` (${nombreCarta(c.carta, idioma)} · ${numLabel(c.carta, set)})` : ''}` : ' · te falta'}`;
    return (
      <button type="button" className={`pocket album-cell ${c.tengo ? 'filled' : 'missing'}`} title={titulo} aria-label={titulo} onClick={() => setAbierta(c.dex)} data-testid={c.tengo ? 'dex-tengo' : 'dex-falta'} data-dex={c.dex}>
        {c.carta ? <Thumb carta={c.carta} set={set} alt={nombreEspecie(c)} idioma={c.entrada?.idioma} /> : <span className="dex-sin-carta">{nombreEspecie(c)}</span>}
        <span className="pocket-n">{numeroDex(c.dex)}</span>
        {c.tengo && c.copias > 1 ? <span className="casilla-cant" title="Copias que tienes de esta especie">×{c.copias}</span> : null}
        {!c.tengo ? <span className="casilla-falta"><span className="casilla-sin">Falta</span></span> : null}
      </button>
    );
  };
  const acciones: AccionLibro[] = [
    { texto: 'Ocultar la Pokédex', icono: 'ojo_cerrado', onClick: async () => { await ocultar(true); router.push('/app/album'); }, testid: 'btn-ocultar-pokedex' }
  ];
  const filtros = (
    <>
      <select className="input sm" value={gen} onChange={e => setGen(Number(e.target.value))} aria-label="Generación" data-testid="filtro-generacion">
        <option value={0}>Todas las gen.</option>
        {GENERACIONES.map(g => <option key={g.n} value={g.n}>Gen. {g.n} · {g.region}</option>)}
      </select>
      <select className="input sm" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo" data-testid="filtro-tipo">
        <option value="">Todos los tipos</option>
        {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_ES[t] || t}</option>)}
      </select>
      <div className="seg filtro-album" data-testid="filtro-album">
        <button type="button" className={modo === 'todas' ? 'active' : ''} onClick={() => setModo('todas')}>Todas</button>
        <button type="button" className={modo === 'tengo' ? 'active' : ''} onClick={() => setModo('tengo')}>Tengo · {tengoFiltro.filter(c => c.tengo).length}</button>
        <button type="button" className={modo === 'faltan' ? 'active' : ''} onClick={() => setModo('faltan')}>Faltan · {tengoFiltro.filter(c => !c.tengo).length}</button>
      </div>
    </>
  );
  const casilla = abierta != null ? celdas.find(c => c.dex === abierta) : undefined;
  const paraElegir = eligiendo != null ? celdas.find(c => c.dex === eligiendo) : undefined;
  return (
    <div className="album-detalle pokedex">
      <Libro<CeldaPokedex>
        items={lista} clave={c => String(c.dex)} celda={celda} cuadriculaId="pokedex"
        miga={{ href: '/app/album', texto: 'Mis álbumes' }}
        titulo={<>Pokédex<span className="pill info" style={{ marginLeft: 8, verticalAlign: 'middle' }}>Por especie</span></>}
        resumen={<span data-testid="progreso-album"><b>{tengo} / {total}</b> · {pct} % · <b>{fmtPen(valor)}</b></span>}
        filtros={filtros} acciones={acciones} nombreUnidad="casillas" precargar={precargar}
        vacio={modo === 'tengo' ? 'Todavía no tienes ninguna carta de estas especies.' : modo === 'faltan' ? 'No te falta ninguna especie de este filtro.' : 'No hay especies con ese filtro.'}
        pagina={pagina} onPagina={setPagina}
      />
      {casilla ? (
        <Sheet titulo={`N.º ${numeroDex(casilla.dex)} · ${nombreEspecie(casilla)}`} onClose={() => setAbierta(null)}>
          {casilla.carta ? (
            <div className="card-row" style={{ cursor: 'default' }}>
              <Thumb carta={casilla.carta} set={cat.setOf(casilla.carta)} className="lg" idioma={casilla.entrada?.idioma} />
              <div className="card-main">
                <div className="card-name">{nombreCarta(casilla.carta, idioma)}</div>
                <div className="card-set">{nombreColeccion(cat.setOf(casilla.carta), idioma)} <span className="num">{numLabel(casilla.carta, cat.setOf(casilla.carta))}</span></div>
                <div className="small" style={{ marginTop: 4 }}>
                  {casilla.tengo ? <>{casilla.elegida ? 'Carta elegida para esta casilla' : 'Tu carta más valiosa de esta especie'} · <b>{fmtPen(casilla.pen)}</b>{casilla.entrada ? <> · <LocChip loc={ubicador.donde(casilla.entrada)} corto /></> : null}</> : <span className="album-miss">No tienes ninguna carta de esta especie todavía</span>}
                </div>
              </div>
            </div>
          ) : <p className="muted small">El catálogo no tiene cartas de esta especie.</p>}
          <div className="stack" style={{ marginTop: 12 }}>
            {casilla.carta ? <Link className="btn" href={`/app/carta/${encodeURIComponent(casilla.carta.id)}`} data-testid="dex-ver-carta">Ver la carta</Link> : null}
            {casilla.tengo ? <button type="button" className="btn primary" onClick={() => { setEligiendo(casilla.dex); setAbierta(null); }} data-testid="dex-elegir-otra">Elegir otra carta para esta casilla</button> : null}
            {casilla.tengo && casilla.elegida ? <button type="button" className="btn" onClick={() => { guardarEleccion(casilla.dex, null); setAbierta(null); }} data-testid="dex-usar-valiosa">Volver a la más valiosa</button> : null}
            {!casilla.tengo ? <Link className="btn primary" href={`/app/mercado?q=${encodeURIComponent(casilla.especie[1])}`} data-testid="dex-ver-mercado"><Icono n="tienda" /> Buscar en el mercado</Link> : null}
          </div>
        </Sheet>
      ) : null}
      {paraElegir ? (
        <Sheet titulo={`N.º ${numeroDex(paraElegir.dex)} · elegir carta`} onClose={() => setEligiendo(null)}>
          <p className="small muted">Tus cartas de {nombreEspecie(paraElegir)}. La elegida se muestra en la casilla de la Pokédex (no cambia nada de lugar).</p>
          <div className="stack" data-testid="dex-opciones">
            {(propias.get(paraElegir.dex) || []).map(e => {
              const c = cat.carta(e.carta_id)!;
              const actual = paraElegir.entrada?.id === e.id;
              return (
                <button key={e.id} type="button" className={`card-row ${actual ? 'activa' : ''}`} onClick={() => { guardarEleccion(paraElegir.dex, c.id); setEligiendo(null); }} aria-pressed={actual} data-testid="dex-opcion">
                  <Thumb carta={c} set={cat.setOf(c)} idioma={e.idioma} />
                  <div className="card-main">
                    <div className="card-name">{nombreCarta(c, idioma)}{actual ? <span className="pill info" style={{ marginLeft: 6 }}>En la casilla</span> : null}</div>
                    <div className="card-set">{nombreColeccion(cat.setOf(c), idioma)} <span className="num">{numLabel(c, cat.setOf(c))}</span>{e.acabado ? ` · ${e.acabado}` : ''}{e.idioma ? ` · ${e.idioma}` : ''}</div>
                    <div className="small"><LocChip loc={ubicador.donde(e)} corto /></div>
                  </div>
                  <PrecioDe carta={c} acabado={e.acabado} />
                </button>
              );
            })}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function PrecioDe({ carta, acabado }: { carta: Carta; acabado: string }) {
  const precios = usePrecios();
  return <div className="card-side"><b>{fmtPen(precios.precioDefecto(carta, acabado).pen)}</b></div>;
}
