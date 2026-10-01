'use client';
// Mejoras 2 · B: asistentes "Ordenar repetidas" (álbum → Bulk) y "Llenar álbumes desde Bulk" (Bulk → álbum).
// Nunca mueven nada solos: muestran el resumen y el usuario confirma.
import { useMemo, useState } from 'react';
import { Icono } from '../Icono';
import { nombreCarta, nombreColeccion } from '@/lib/catalogo';
import { cajasOrdenadas, PUBLICACION_VIVA, type Caja } from '@/lib/coleccion';
import { desdeBulkParaAlbumes, posicionesEnBulk, repetidasEnAlbumes, resumenPosiciones, type Candidata, type Repetida } from '@/lib/repetidas';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { Sheet } from '../Sheet';
import { Thumb } from '../Thumb';
import { useToast } from '../Toast';

const idiomaTxt = (i: string): string => (i === '—' ? 'sin idioma' : i);

/** Repetidas en los álbumes y cartas del Bulk que pueden ir a una casilla vacía (opcionalmente de un solo álbum). */
export function useOrdenar(soloSet?: string): { repetidas: Repetida[]; copiasRepetidas: number; candidatas: Candidata[] } {
  const cat = useCatalogo();
  const col = useColeccion();
  return useMemo(() => {
    const publicadas = new Set(col.publicaciones.filter(p => p.entrada_id && PUBLICACION_VIVA.has(p.estado)).map(p => p.entrada_id as string));
    const repetidas = repetidasEnAlbumes(cat, col.entradas, publicadas, soloSet);
    const candidatas = col.cajas.length ? desdeBulkParaAlbumes(cat, col.entradas, col.cajas, soloSet) : [];
    return { repetidas, copiasRepetidas: repetidas.reduce((n, r) => n + r.copias, 0), candidatas };
  }, [cat, col.entradas, col.cajas, col.publicaciones, soloSet]);
}

const CLAVE_IGNORAR = 'poketcg:ordenar-ignorado';
function leerIgnorado(): { repetidas: number; candidatas: number } {
  try { return JSON.parse(localStorage.getItem(CLAVE_IGNORAR) || '') || { repetidas: 0, candidatas: 0 }; } catch { return { repetidas: 0, candidatas: 0 }; }
}

/** Avisos al abrir Álbumes: "Tienes N cartas repetidas…" y "N cartas de tu Bulk pueden ir a tus álbumes". */
export function AvisosOrdenar() {
  const { repetidas, copiasRepetidas, candidatas } = useOrdenar();
  const [abrir, setAbrir] = useState<'repetidas' | 'llenar' | null>(null);
  const [ignorado, setIgnorado] = useState(() => (typeof window === 'undefined' ? { repetidas: 0, candidatas: 0 } : leerIgnorado()));
  const ignorar = (que: 'repetidas' | 'candidatas', n: number) => { const v = { ...ignorado, [que]: n }; setIgnorado(v); try { localStorage.setItem(CLAVE_IGNORAR, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
  const verRepetidas = copiasRepetidas > 0 && ignorado.repetidas !== copiasRepetidas;
  const verLlenar = candidatas.length > 0 && ignorado.candidatas !== candidatas.length;
  if (!verRepetidas && !verLlenar && !abrir) return null;
  return (
    <>
      {verRepetidas ? (
        <div className="notice warn aviso-ordenar" data-testid="aviso-repetidas">
          <div className="texto"><Icono n="bulk" tam={18} /><span><b>Tienes {copiasRepetidas} {copiasRepetidas === 1 ? 'carta repetida' : 'cartas repetidas'} en tus álbumes.</b> ¿Las mandamos a Bulk? Cada casilla guarda 1 copia; las demás van al Bulk con su posición.</span></div>
          <div className="row">
            <button className="btn sm primary" onClick={() => setAbrir('repetidas')} data-testid="btn-ordenar-repetidas">Ordenar repetidas</button>
            <button className="btn sm ghost" onClick={() => ignorar('repetidas', copiasRepetidas)}>Ahora no</button>
          </div>
        </div>
      ) : null}
      {verLlenar ? (
        <div className="notice info aviso-ordenar" data-testid="aviso-llenar">
          <div className="texto"><Icono n="album" tam={18} /><span><b>{candidatas.length} {candidatas.length === 1 ? 'carta de tu Bulk puede' : 'cartas de tu Bulk pueden'} ir a tus álbumes</b> (tienen la casilla vacía).</span></div>
          <div className="row">
            <button className="btn sm primary" onClick={() => setAbrir('llenar')} data-testid="btn-llenar-albumes">Revisar y mover</button>
            <button className="btn sm ghost" onClick={() => ignorar('candidatas', candidatas.length)}>Ahora no</button>
          </div>
        </div>
      ) : null}
      {abrir === 'repetidas' ? <OrdenarRepetidasSheet repetidas={repetidas} onClose={() => setAbrir(null)} /> : null}
      {abrir === 'llenar' ? <LlenarAlbumesSheet candidatas={candidatas} onClose={() => setAbrir(null)} /> : null}
    </>
  );
}

/** Asistente: elegir (o crear) el Bulk → resumen con posiciones → confirmar. */
export function OrdenarRepetidasSheet({ repetidas, onClose }: { repetidas: Repetida[]; onClose: () => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const cajas = cajasOrdenadas(col.cajas);
  const [cajaId, setCajaId] = useState<string | null>(col.ultimaCajaId && cajas.some(c => c.id === col.ultimaCajaId) ? col.ultimaCajaId : cajas[0]?.id || null);
  const [paso, setPaso] = useState<1 | 2>(1);
  const [nuevo, setNuevo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const idioma = perfil.idioma_nombres;
  const copias = repetidas.reduce((n, r) => n + r.copias, 0);
  const caja = cajas.find(c => c.id === cajaId) || null;
  const porCaja = (c: Caja) => col.entradas.filter(e => e.caja_id === c.id).reduce((n, e) => n + e.cantidad, 0);
  // resumen: posición que tendrá cada movimiento en el Bulk elegido (las divididas como entradas nuevas)
  const resumen = useMemo(() => {
    if (!caja) return { posiciones: new Map<string, number>(), total: 0 };
    const movidas = repetidas.map(r => (r.todo ? r.entrada : { ...r.entrada, id: 'nueva:' + r.entrada.id, cantidad: r.copias, album_coleccion: null, creado_en: new Date().toISOString() }));
    return posicionesEnBulk(cat, caja, col.entradas, movidas);
  }, [cat, caja, col.entradas, repetidas]);
  const posicionDe = (r: Repetida) => resumen.posiciones.get(r.todo ? r.entrada.id : 'nueva:' + r.entrada.id);
  const publicadas = repetidas.filter(r => r.publicada).length;
  async function crearBulk() {
    const c = await col.crearCaja({ nombre: nuevo.trim() || `Bulk ${cajas.length + 1}` });
    if (c) { setCajaId(c.id); setNuevo(''); toast('Bulk creado', 'ok'); }
  }
  async function confirmar() {
    if (!caja) return;
    setOcupado(true);
    const r = await col.ordenarRepetidas(caja.id, repetidas.map(x => ({ entrada: x.entrada.id, cantidad: x.copias, todo: x.todo })));
    setOcupado(false);
    if (!r.ok) { toast(r.error || col.error || 'No se pudo ordenar', 'danger', 4000); return; }
    toast(`${r.copias} ${r.copias === 1 ? 'carta repetida enviada' : 'cartas repetidas enviadas'} a ${caja.nombre}${r.omitidas.length ? ` · ${r.omitidas.length} no se movieron (tienen copias reservadas por un comprador)` : ''}`, 'ok', 4500);
    onClose();
  }
  if (paso === 1) {
    return (
      <Sheet titulo="Ordenar repetidas" sobre={<span className="small muted">Paso 1 de 2 · ¿A qué Bulk van?</span>} onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!caja} onClick={() => setPaso(2)} data-testid="btn-ordenar-continuar">Continuar</button></>}>
        <p className="small muted">Tienes <b>{copias}</b> {copias === 1 ? 'carta repetida' : 'cartas repetidas'} en {new Set(repetidas.map(r => r.set + r.idioma)).size} {new Set(repetidas.map(r => r.set + r.idioma)).size === 1 ? 'álbum' : 'álbumes'}. Cada casilla se queda con 1 copia y las demás pasan al Bulk que elijas, con su posición.</p>
        {cajas.length ? (
          <div className="opciones-lista" role="radiogroup" aria-label="Bulk de destino">
            {cajas.map(c => (
              <label key={c.id} className={`opcion ${cajaId === c.id ? 'activa' : ''}`} data-testid="ordenar-bulk-opcion">
                <input type="radio" name="bulk-destino" className="marca" checked={cajaId === c.id} onChange={() => setCajaId(c.id)} />
                <span className="grow"><b>{c.nombre}</b><span className="small muted"> · {porCaja(c)} {porCaja(c) === 1 ? 'carta' : 'cartas'}{c.en_venta ? ' · en venta' : ''}</span></span>
              </label>
            ))}
          </div>
        ) : <p className="notice warn small">Todavía no tienes ningún Bulk: crea el primero aquí.</p>}
        <div className="row" style={{ marginTop: 10, gap: 6 }}>
          <input className="input sm grow" placeholder={cajas.length ? 'Crear un Bulk nuevo…' : 'Nombre de tu primer Bulk (p. ej. Bulk 1)'} value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') crearBulk(); }} data-testid="input-nuevo-bulk" />
          <button className="btn sm" onClick={crearBulk} data-testid="btn-crear-bulk-ordenar">+ Crear</button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet titulo="Ordenar repetidas" sobre={<span className="small muted">Paso 2 de 2 · Revisa y confirma</span>} onClose={onClose} pie={<><button className="btn" onClick={() => setPaso(1)}>Atrás</button><button className="btn primary" disabled={ocupado || !caja} onClick={confirmar} data-testid="btn-ordenar-confirmar">{ocupado ? 'Moviendo…' : `Mandar ${copias} a ${caja?.nombre}`}</button></>}>
      <div className="panel resumen-ordenar" data-testid="resumen-repetidas">
        <div className="fila-dato"><span className="muted">Copias que salen de los álbumes</span><b>{copias}</b></div>
        <div className="fila-dato"><span className="muted">Van a</span><b>{caja?.nombre}</b></div>
        <div className="fila-dato"><span className="muted">Posiciones</span><b>{resumenPosiciones([...resumen.posiciones.values()])}</b></div>
        {publicadas ? <div className="fila-dato"><span className="muted">En venta</span><b>{publicadas} {publicadas === 1 ? 'publicación sigue' : 'publicaciones siguen'} con sus copias</b></div> : null}
      </div>
      <div className="card-list" style={{ marginTop: 10 }}>
        {repetidas.map(r => {
          const set = cat.setOf(r.carta);
          return (
            <div key={r.entrada.id} className="card-row" style={{ cursor: 'default' }} data-testid="fila-repetida">
              <Thumb carta={r.carta} set={set} idioma={r.idioma} />
              <div className="card-main">
                <div className="card-name">{nombreCarta(r.carta, idioma)} <span className="num">{r.carta.l}</span></div>
                <div className="card-set">Álbum {nombreColeccion(set, idioma, true)} {idiomaTxt(r.idioma)} → {caja?.nombre} · posición #{posicionDe(r) ?? '?'}</div>
                <div className="small muted">{r.todo ? `${r.copias === 1 ? 'Esta copia' : `Estas ${r.copias} copias`} (la casilla ya tiene otra)` : `${r.copias} de ${r.entrada.cantidad}: 1 se queda en la casilla`}{r.publicada ? ' · en venta' : ''}</div>
              </div>
              <span className="pill warn">×{r.copias}</span>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Asistente inverso: cartas del Bulk que encajan en una casilla vacía; se revisan con casillas y se mueven. */
export function LlenarAlbumesSheet({ candidatas, onClose }: { candidatas: Candidata[]; onClose: () => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const idioma = perfil.idioma_nombres;
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const elegidas = candidatas.filter(c => !fuera.has(c.entrada.id));
  const grupos = useMemo(() => {
    const m = new Map<string, Candidata[]>();
    for (const c of candidatas) { const k = c.set + '|' + c.idioma; m.set(k, [...(m.get(k) || []), c]); }
    return [...m.entries()];
  }, [candidatas]);
  const alternar = (id: string) => setFuera(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarGrupo = (lista: Candidata[], marcar: boolean) => setFuera(f => { const n = new Set(f); for (const c of lista) { if (marcar) n.delete(c.entrada.id); else n.add(c.entrada.id); } return n; });
  async function confirmar() {
    if (!elegidas.length) return;
    setOcupado(true);
    const r = await col.llenarAlbumes(elegidas.map(c => ({ entrada: c.entrada.id, set: c.set })));
    setOcupado(false);
    if (!r.ok) { toast(r.error || col.error || 'No se pudo mover', 'danger', 4000); return; }
    toast(`${r.movidas} ${r.movidas === 1 ? 'carta pasó' : 'cartas pasaron'} del Bulk a sus álbumes${r.omitidas.length ? ` · ${r.omitidas.length} no se movieron` : ''}`, 'ok', 4500);
    onClose();
  }
  return (
    <Sheet titulo="Llenar álbumes desde Bulk" onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado || !elegidas.length} onClick={confirmar} data-testid="btn-llenar-confirmar">{ocupado ? 'Moviendo…' : `Mover ${elegidas.length} a sus álbumes`}</button></>}>
      <p className="small muted">Estas cartas están en tu Bulk y su casilla del álbum está vacía. Desmarca las que prefieras dejar en el Bulk. Si una entrada tiene varias copias, solo 1 va al álbum y las demás siguen en el Bulk (con su publicación, si la hay).</p>
      {grupos.map(([k, lista]) => {
        const set = cat.coleccion(lista[0].set);
        const marcadas = lista.filter(c => !fuera.has(c.entrada.id)).length;
        return (
          <div key={k} className="grupo-llenar" data-testid="grupo-llenar">
            <label className="row small" style={{ justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 4px' }}>
              <b>Álbum {nombreColeccion(set, idioma, true)} {idiomaTxt(lista[0].idioma)} · {marcadas} de {lista.length}</b>
              <input type="checkbox" className="marca" checked={marcadas === lista.length} ref={el => { if (el) el.indeterminate = marcadas > 0 && marcadas < lista.length; }} onChange={e => alternarGrupo(lista, e.target.checked)} aria-label={`Marcar todas de ${nombreColeccion(set, idioma, true)} ${idiomaTxt(lista[0].idioma)}`} />
            </label>
            <div className="card-list">
              {lista.map(c => (
                <label key={c.entrada.id} className="card-row" style={{ cursor: 'pointer' }} data-testid="llenar-fila">
                  <input type="checkbox" className="marca" checked={!fuera.has(c.entrada.id)} onChange={() => alternar(c.entrada.id)} />
                  <Thumb carta={c.carta} set={set} idioma={c.idioma} />
                  <div className="card-main">
                    <div className="card-name">{nombreCarta(c.carta, idioma)} <span className="num">{c.carta.l}</span></div>
                    <div className="card-set">{c.caja.nombre} → casilla {c.carta.l}{c.todo ? '' : ` · 1 de ${c.entrada.cantidad} copias`}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}
