'use client';
import { useMemo, useState } from 'react';
import type { Carta } from '@/lib/catalogo';
import { nombreCarta, nombreColeccion } from '@/lib/catalogo';
import type { Album, Casilla } from '@/lib/coleccion';
import { cartasDeTipoAlbum, descripcionTipo, paginasPara, tipoDeAlbum, type ParametrosAlbum } from '@/lib/albumes-tipos';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { useToast } from '../Toast';
import { Sheet } from '../Sheet';
import { Thumb } from '../Thumb';
import { SelectorColeccion } from '../Filtros';

const LOTE = 120;

/**
 * Mejoras 5 · B: "Sugerencias" de un álbum de tipo (o de un ilustrador con muchas cartas): las cartas del catálogo que encajan y
 * aún no están en el álbum, las que tengo primero, con filtros por colección y rareza. Se marcan y van a los bolsillos libres
 * (se añaden páginas si hacen falta).
 */
export function SugerenciasSheet({ album, casillas, onClose, onAgregadas }: { album: Album; casillas: Map<number, Casilla>; onClose: () => void; onAgregadas: () => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const idioma = perfil.idioma_nombres;
  const tipo = tipoDeAlbum(album);
  const parametros = useMemo(() => (album.parametros || {}) as ParametrosAlbum, [album.parametros]);
  const [set, setSet] = useState('');
  const [rareza, setRareza] = useState('');
  const [soloTengo, setSoloTengo] = useState(false);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [mostrar, setMostrar] = useState(LOTE);
  const [guardando, setGuardando] = useState(false);

  const mias = useMemo(() => { const m = new Map<string, number>(); for (const e of col.entradas) if (e.carta_id) m.set(e.carta_id, (m.get(e.carta_id) || 0) + e.cantidad); return m; }, [col.entradas]);
  // candidatas: las del tipo que no estén ya en un bolsillo de este álbum; las que tengo primero (dentro de cada grupo, por fecha)
  const candidatas = useMemo(() => {
    const puestas = new Set([...casillas.values()].map(c => c.carta_id).filter(Boolean));
    const lista = cartasDeTipoAlbum(cat, tipo, parametros).filter(c => !puestas.has(c.id));
    const tengo = lista.filter(c => mias.has(c.id)), faltan = lista.filter(c => !mias.has(c.id));
    return [...tengo, ...faltan];
  }, [cat, tipo, parametros, casillas, mias]);
  const rarezas = useMemo(() => { const m = new Map<string, number>(); for (const c of candidatas) if (c.r) m.set(c.r, (m.get(c.r) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); }, [candidatas]);
  const filtradas = useMemo(() => candidatas.filter(c => (!set || c.s === set) && (!rareza || c.r === rareza) && (!soloTengo || mias.has(c.id))), [candidatas, set, rareza, soloTengo, mias]);
  const tengoTotal = useMemo(() => candidatas.filter(c => mias.has(c.id)).length, [candidatas, mias]);
  const visibles = filtradas.slice(0, mostrar);

  const alternar = (id: string) => setElegidas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarVisibles = (si: boolean) => setElegidas(s => { const n = new Set(s); for (const c of filtradas) { if (si) n.add(c.id); else n.delete(c.id); } return n; });
  const marcarTengo = () => setElegidas(s => { const n = new Set(s); for (const c of candidatas) if (mias.has(c.id)) n.add(c.id); return n; });

  async function agregar() {
    const lista = candidatas.filter(c => elegidas.has(c.id));
    if (!lista.length || guardando) return;
    setGuardando(true);
    const porPagina = album.columnas * album.filas;
    let total = album.paginas * porPagina;
    const ocupadas = new Set(casillas.keys());
    const necesarias = paginasPara(ocupadas.size + lista.length, album.columnas, album.filas);
    let paginasNuevas = 0;
    if (necesarias > album.paginas) {
      const ok = await col.editarAlbum(album.id, { paginas: necesarias });
      if (!ok) { setGuardando(false); toast('No se pudieron añadir páginas', 'danger'); return; }
      paginasNuevas = necesarias - album.paginas;
      total = necesarias * porPagina;
    }
    const filas: { indice: number; carta_id: string }[] = [];
    let i = 0;
    for (const c of lista) { while (i < total && ocupadas.has(i)) i++; if (i >= total) break; filas.push({ indice: i, carta_id: c.id }); i++; }
    const ok = await col.asignarBolsillos(album.id, filas);
    setGuardando(false);
    if (!ok) { toast('No se pudieron agregar', 'danger'); return; }
    toast(`${filas.length} ${filas.length === 1 ? 'carta agregada' : 'cartas agregadas'} al álbum${paginasNuevas ? ` (${paginasNuevas} ${paginasNuevas === 1 ? 'página nueva' : 'páginas nuevas'})` : ''}`, 'ok', 4000);
    onAgregadas();
    onClose();
  }

  const fila = (c: Carta) => {
    const n = mias.get(c.id) || 0;
    return (
      <label key={c.id} className="card-row fila-sugerencia" style={{ cursor: 'pointer' }} data-testid="sugerencia-fila" data-tengo={n ? '1' : '0'}>
        <input type="checkbox" className="marca" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} aria-label={`${nombreCarta(c, idioma)} ${c.l}`} />
        <Thumb carta={c} set={cat.setOf(c)} alt={nombreCarta(c, idioma)} />
        <div className="card-main">
          <div className="card-name">{nombreCarta(c, idioma)} <span className="num">{c.l}</span>{n ? <span className="pill ok" style={{ marginLeft: 6 }}>tengo{n > 1 ? ` ×${n}` : ''}</span> : null}</div>
          <div className="card-set">{nombreColeccion(cat.setOf(c), idioma)}{c.r ? ` · ${c.r}` : ''}</div>
        </div>
      </label>
    );
  };

  return (
    <Sheet titulo="Sugerencias" sobre={<span className="small muted">{descripcionTipo(cat, album, idioma)} · {candidatas.length} {candidatas.length === 1 ? 'carta que encaja' : 'cartas que encajan'} y aún no están en el álbum</span>} onClose={onClose} className="hoja-sugerencias"
      pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary grow" disabled={!elegidas.size || guardando} onClick={agregar} data-testid="btn-agregar-sugerencias">{guardando ? 'Agregando…' : `Agregar ${elegidas.size} al álbum`}</button></>}>
      <div className="stack filtros-sugerencias">
        <div className="seg" data-testid="sugerencias-mostrar"><button type="button" className={!soloTengo ? 'active' : ''} onClick={() => setSoloTengo(false)}>Todas · {candidatas.length}</button><button type="button" className={soloTengo ? 'active' : ''} onClick={() => setSoloTengo(true)} data-testid="sugerencias-solo-tengo">Las que tengo · {tengoTotal}</button></div>
        <SelectorColeccion valor={set} onChange={setSet} />
        <div className="field"><label>Rareza</label><select className="input" value={rareza} onChange={e => setRareza(e.target.value)} data-testid="sugerencias-rareza"><option value="">Todas</option>{rarezas.map(([r, n]) => <option key={r} value={r}>{r} ({n})</option>)}</select></div>
        <div className="row wrap acciones-sugerencias">
          {tengoTotal ? <button type="button" className="chipbtn" onClick={marcarTengo} data-testid="btn-marcar-tengo">Marcar las que tengo ({tengoTotal})</button> : null}
          <button type="button" className="chipbtn" onClick={() => marcarVisibles(true)} data-testid="btn-marcar-filtradas">Marcar estas {filtradas.length}</button>
          {elegidas.size ? <button type="button" className="chipbtn" onClick={() => setElegidas(new Set())}>Desmarcar todo</button> : null}
        </div>
      </div>
      <div className="card-list" style={{ marginTop: 10 }} data-testid="lista-sugerencias">
        {visibles.map(fila)}
        {!filtradas.length ? <p className="small muted" style={{ padding: 8 }}>{candidatas.length ? 'Ninguna con esos filtros.' : 'Todas las cartas que encajan ya están en el álbum.'}</p> : null}
        {filtradas.length > mostrar ? <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setMostrar(m => m + LOTE)} data-testid="btn-mostrar-mas">Mostrar {Math.min(LOTE, filtradas.length - mostrar)} más (quedan {filtradas.length - mostrar})</button> : null}
      </div>
    </Sheet>
  );
}
