'use client';
// Mejoras 2 · C: poner en venta un álbum eligiendo con qué me quedo (1 de cada, las más caras, una por una, todo),
// con el resumen antes de confirmar. Las que se quedan no se tocan; las que se publican siguen las reglas de siempre
// (precio por defecto, foto obligatoria por encima de S/ 50).
import { useMemo, useState } from 'react';
import { Icono } from '../Icono';
import { nombreCarta, nombreColeccion, type Coleccion } from '@/lib/catalogo';
import type { Entrada } from '@/lib/coleccion';
import { fmtPen } from '@/lib/precios-core';
import { REGLAS_POR_DEFECTO, repartirVenta, type ReglasVenta } from '@/lib/venta-album';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { Sheet } from '../Sheet';
import { Thumb } from '../Thumb';
import { useToast } from '../Toast';

type Props = { set: Coleccion; idioma: string; entradas: Entrada[]; onClose: () => void; onPublicado?: (n: number) => void };

export function PonerEnVentaSheet({ set, idioma: idiomaAlb, entradas, onClose, onPublicado }: Props) {
  const cat = useCatalogo();
  const col = useColeccion();
  const precios = usePrecios();
  const { perfil } = usePerfil();
  const toast = useToast();
  const idioma = perfil.idioma_nombres;
  const [reglas, setReglas] = useState<ReglasVenta>({ ...REGLAS_POR_DEFECTO, mayorPrecio: { ...REGLAS_POR_DEFECTO.mayorPrecio }, excluidas: new Set() });
  const [unaPorUna, setUnaPorUna] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const precioDe = (e: Entrada) => precios.precioDefecto(cat.carta(e.carta_id), e.acabado).pen;
  const resumen = useMemo(() => repartirVenta(entradas, precioDe, reglas), [entradas, reglas, precios.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  const precioMax = useMemo(() => Math.max(1, ...entradas.map(precioDe)), [entradas, precios.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  const copiasTotal = entradas.reduce((n, e) => n + e.cantidad, 0);
  const cartasTotal = new Set(entradas.map(e => e.carta_id)).size;
  const porCarta = useMemo(() => {
    const m = new Map<string, { copias: number; precio: number; publicar: number; quedan: number; motivo?: string }>();
    for (const l of resumen.lineas) { const v = m.get(l.cartaId) || { copias: 0, precio: l.precio, publicar: 0, quedan: 0 }; v.copias += l.entrada.cantidad; v.publicar += l.publicar; v.quedan += l.quedan; v.precio = Math.max(v.precio, l.precio); if (l.motivo) v.motivo = l.motivo; m.set(l.cartaId, v); }
    return [...m.entries()].map(([id, v]) => ({ carta: cat.carta(id)!, ...v })).filter(x => x.carta).sort((a, b) => a.carta.l.localeCompare(b.carta.l, undefined, { numeric: true }));
  }, [resumen, cat]);
  const todo = reglas.modo === 'todo';
  const poner = (p: Partial<ReglasVenta>) => setReglas(r => ({ ...r, ...p }));
  const alternarCarta = (id: string) => setReglas(r => { const ex = new Set(r.excluidas); if (ex.has(id)) ex.delete(id); else ex.add(id); return { ...r, excluidas: ex }; });
  const limiteMax = Math.ceil(precioMax);

  async function publicar() {
    if (!resumen.publican) return;
    setOcupado(true);
    await precios.pedir([...new Set(entradas.map(e => e.carta_id as string))]).catch(() => {});
    const n = await col.publicarVarias(resumen.lineas.filter(l => l.publicar > 0).map(l => ({ entrada_id: l.entrada.id, cantidad: l.publicar })));
    setOcupado(false);
    if (!n) { toast(col.error || 'No se publicó ninguna carta', 'danger', 4000); return; }
    toast(`${resumen.publican} ${resumen.publican === 1 ? 'copia publicada' : 'copias publicadas'} con el precio por defecto${resumen.conFoto ? ` · ${resumen.conFoto} ${resumen.conFoto === 1 ? 'queda pausada' : 'quedan pausadas'} hasta que agregues foto` : ''}`, 'ok', 4500);
    onPublicado?.(n);
    onClose();
  }

  return (
    <Sheet titulo="Poner en venta" sobre={<span className="small muted">Álbum {nombreColeccion(set, idioma, true)} {idiomaAlb} · {copiasTotal} {copiasTotal === 1 ? 'copia' : 'copias'} de {cartasTotal} {cartasTotal === 1 ? 'carta' : 'cartas'} sin publicar</span>} onClose={onClose} className="hoja-venta-album"
      pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado || !resumen.publican} onClick={publicar} data-testid="btn-confirmar-venta-album">{ocupado ? 'Publicando…' : `Publicar ${resumen.publican} ${resumen.publican === 1 ? 'copia' : 'copias'}`}</button></>}>
      <h3 className="pregunta-venta">¿Con qué cartas te quieres quedar?</h3>
      <div className="opciones-lista opciones-venta">
        <label className={`opcion ${!todo && reglas.unaDeCada ? 'activa' : ''} ${todo ? 'apagada' : ''}`} data-testid="opcion-una-de-cada">
          <input type="checkbox" className="marca" checked={!todo && reglas.unaDeCada} disabled={todo} onChange={e => poner({ unaDeCada: e.target.checked })} />
          <span className="grow"><b>Quedarme con 1 de cada carta</b> <span className="pill ok">recomendado</span><span className="small muted bloque">Se venden solo las repetidas: de 5 Pinsir, 1 se queda en el álbum y 4 salen a la venta.</span></span>
        </label>
        <label className={`opcion ${!todo && reglas.mayorPrecio.activo ? 'activa' : ''} ${todo ? 'apagada' : ''}`} data-testid="opcion-mayor-precio">
          <input type="checkbox" className="marca" checked={!todo && reglas.mayorPrecio.activo} disabled={todo} onChange={e => poner({ mayorPrecio: { ...reglas.mayorPrecio, activo: e.target.checked } })} />
          <span className="grow"><b>Quedarme con las de mayor precio</b><span className="small muted bloque">Esas no se publican; el resto sí. Se puede combinar con la opción anterior.</span></span>
        </label>
        {!todo && reglas.mayorPrecio.activo ? (
          <div className="detalle-opcion" data-testid="detalle-mayor-precio">
            <div className="seg" role="radiogroup">
              <button className={reglas.mayorPrecio.tipo === 'limite' ? 'active' : ''} onClick={() => poner({ mayorPrecio: { ...reglas.mayorPrecio, tipo: 'limite' } })} data-testid="tipo-limite">Las que valen más de…</button>
              <button className={reglas.mayorPrecio.tipo === 'topN' ? 'active' : ''} onClick={() => poner({ mayorPrecio: { ...reglas.mayorPrecio, tipo: 'topN' } })} data-testid="tipo-topn">Las N más caras</button>
            </div>
            {reglas.mayorPrecio.tipo === 'limite' ? (
              <div className="row" style={{ alignItems: 'center', gap: 10, marginTop: 10 }}>
                <span className="small muted">Me quedo con las que valen más de</span>
                <span className="precio-limite"><span className="muted">S/</span> <input type="number" className="input sm" min={0} step={1} value={reglas.mayorPrecio.limite} onChange={e => poner({ mayorPrecio: { ...reglas.mayorPrecio, limite: Math.max(0, parseFloat(e.target.value) || 0) } })} data-testid="input-limite" aria-label="Límite en soles" /></span>
                <input type="range" className="deslizador" min={0} max={limiteMax} step={1} value={Math.min(reglas.mayorPrecio.limite, limiteMax)} onChange={e => poner({ mayorPrecio: { ...reglas.mayorPrecio, limite: parseFloat(e.target.value) } })} aria-label="Límite en soles" data-testid="deslizador-limite" />
                <span className="small muted">{resumen.cartasCaras.size} {resumen.cartasCaras.size === 1 ? 'carta se queda' : 'cartas se quedan'}</span>
              </div>
            ) : (
              <div className="row" style={{ alignItems: 'center', gap: 10, marginTop: 10 }}>
                <span className="small muted">Me quedo con las</span>
                <input type="number" className="input sm" style={{ width: 80 }} min={1} max={cartasTotal} value={reglas.mayorPrecio.n} onChange={e => poner({ mayorPrecio: { ...reglas.mayorPrecio, n: Math.max(1, Math.min(cartasTotal, parseInt(e.target.value, 10) || 1)) } })} data-testid="input-topn" aria-label="Cuántas cartas" />
                <span className="small muted">más caras ({[...resumen.cartasCaras].map(id => nombreCarta(cat.carta(id)!, idioma)).slice(0, 3).join(', ')}{resumen.cartasCaras.size > 3 ? '…' : ''})</span>
              </div>
            )}
          </div>
        ) : null}
        <label className={`opcion ${!todo && unaPorUna ? 'activa' : ''} ${todo ? 'apagada' : ''}`} data-testid="opcion-una-por-una">
          <input type="checkbox" className="marca" checked={!todo && unaPorUna} disabled={todo} onChange={e => setUnaPorUna(e.target.checked)} />
          <span className="grow"><b>Elegir una por una</b><span className="small muted bloque">La lista viene marcada según las opciones de arriba; desmarca las que no quieras vender.</span></span>
        </label>
        <label className={`opcion ${todo ? 'activa' : ''}`} data-testid="opcion-vender-todo">
          <input type="checkbox" className="marca" checked={todo} onChange={e => poner({ modo: e.target.checked ? 'todo' : 'reglas' })} />
          <span className="grow"><b>Vender todo</b><span className="small muted bloque">Todas las copias del álbum salen a la venta.</span></span>
        </label>
      </div>
      {!todo && unaPorUna ? (
        <div className="card-list lista-venta" data-testid="lista-una-por-una">
          {porCarta.map(x => {
            const excluida = reglas.excluidas.has(x.carta.id);
            const porRegla = !excluida && x.publicar === 0;
            return (
              <label key={x.carta.id} className={`card-row ${excluida || porRegla ? 'apagada' : ''}`} style={{ cursor: 'pointer' }} data-testid="fila-venta-carta">
                <input type="checkbox" className="marca" checked={!excluida && x.publicar > 0} disabled={porRegla} onChange={() => alternarCarta(x.carta.id)} />
                <Thumb carta={x.carta} set={set} idioma={idiomaAlb} />
                <div className="card-main">
                  <div className="card-name">{nombreCarta(x.carta, idioma)} <span className="num">{x.carta.l}</span></div>
                  <div className="card-set">{x.copias} {x.copias === 1 ? 'copia' : 'copias'} · {fmtPen(x.precio)} c/u</div>
                  <div className="small muted">{x.publicar ? `Se ${x.publicar === 1 ? 'publica' : 'publican'} ${x.publicar}${x.quedan ? ` · ${x.quedan === 1 ? 'se queda' : 'se quedan'} ${x.quedan}` : ''}` : excluida ? 'Se queda (desmarcada)' : x.motivo === 'precio' ? 'Se queda (mayor precio)' : 'Se queda (1 de cada)'}</div>
                </div>
              </label>
            );
          })}
        </div>
      ) : null}
      <div className="panel resumen-venta" data-testid="resumen-venta-album">
        <div className="fila-dato"><span className="muted">Se publican</span><b>{resumen.publican} {resumen.publican === 1 ? 'copia' : 'copias'} ({resumen.cartasPublicadas} {resumen.cartasPublicadas === 1 ? 'carta' : 'cartas'})</b></div>
        <div className="fila-dato"><span className="muted">Te quedas con</span><b>{resumen.quedan} {resumen.quedan === 1 ? 'copia' : 'copias'} ({resumen.cartasQuedan} {resumen.cartasQuedan === 1 ? 'carta' : 'cartas'})</b></div>
        <div className="fila-dato"><span className="muted">Precio estimado de lo publicado</span><b>{fmtPen(resumen.total)}</b></div>
        <div className="fila-dato"><span className="muted">Necesitarán foto (más de S/ 50)</span><b>{resumen.conFoto}</b></div>
        <p className="small muted" style={{ margin: '8px 0 0' }}><Icono n="info" tam={14} /> Las que se quedan no se tocan. Las publicadas salen con el precio por defecto (el mayor entre el piso y el mercado); las de más de S/ 50 quedan pausadas hasta que les agregues una foto. Las repetidas que se venden se muestran en el álbum como «para vender» hasta que se vendan o las mandes a Bulk.</p>
      </div>
    </Sheet>
  );
}
