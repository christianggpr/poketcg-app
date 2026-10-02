'use client';
import { useState } from 'react';
import { MARCAS_AGUA, type IdMarcaAgua } from '@/lib/patrones';
import { COLORES_PORTADA, colorPortada, marcaAgua } from '@/lib/portadas';
import { Icono } from './Icono';
import { PortadaPropia } from './Portadas';
import { Sheet } from './Sheet';
import { Campo } from './ui';

export type DatosAlbumPropio = { nombre: string; descripcion: string; paginas: number; columnas: number; filas: number; color: string; marca_agua: IdMarcaAgua };

/** Datos iniciales normalizados (nombre vacío, 10 páginas de 3 × 3, color y marca por defecto). */
export function datosAlbumIniciales(inicial?: Partial<DatosAlbumPropio>): DatosAlbumPropio {
  return { nombre: inicial?.nombre || '', descripcion: inicial?.descripcion || '', paginas: inicial?.paginas || 10, columnas: inicial?.columnas || 3, filas: inicial?.filas || 3, color: colorPortada(inicial?.color), marca_agua: marcaAgua(inicial?.marca_agua) };
}

/**
 * Mejoras 3 · A (maqueta M3-Nuevo) · Mejoras 5 · B: el formulario de portada y tamaño (vista previa en vivo, nombre, 8 colores,
 * marca de agua y casillas), usado en la ventana de editar y en el paso 3 del asistente de nuevo álbum.
 * `paginasNecesarias`: con un álbum que se rellena solo, las páginas se calculan y se muestran como mínimo.
 */
export function FormularioAlbumPropio({ valor, onChange, editar = false, paginasNecesarias, nota }: { valor: DatosAlbumPropio; onChange: (d: DatosAlbumPropio) => void; editar?: boolean; paginasNecesarias?: number | null; nota?: React.ReactNode }) {
  const d = valor;
  const set = (parte: Partial<DatosAlbumPropio>) => onChange({ ...d, ...parte });
  return (
    <>
      <PortadaPropia nombre={d.nombre} color={d.color} marca={d.marca_agua} grande subtitulo="Vista previa de la portada" />
      <Campo label="Nombre">{id => <input id={id} className="input" autoFocus={!editar} value={d.nombre} onChange={e => set({ nombre: e.target.value })} placeholder="Charmander, Mis favoritas, Carpeta azul…" data-testid="album-nombre" />}</Campo>
      {editar ? <Campo label="Descripción">{id => <input id={id} className="input" value={d.descripcion} onChange={e => set({ descripcion: e.target.value })} />}</Campo> : null}
      <div className="field">
        <label>Color de la portada</label>
        <div className="colores-portada" role="radiogroup" aria-label="Color de la portada" data-testid="colores-portada">
          {COLORES_PORTADA.map(c => <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={`Color ${c}`} className={`color-portada ${d.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} data-testid={`color-${c.slice(1).toLowerCase()}`}>{d.color === c ? <Icono n="ok" tam={18} grosor={3} /> : null}</button>)}
        </div>
      </div>
      <div className="field">
        <label>Marca de agua</label>
        <div className="seg marcas-agua" role="radiogroup" aria-label="Marca de agua" data-testid="marcas-agua">
          {MARCAS_AGUA.map(m => <button key={m.id} type="button" role="radio" aria-checked={d.marca_agua === m.id} className={d.marca_agua === m.id ? 'active' : ''} onClick={() => set({ marca_agua: m.id })} data-testid={`marca-${m.id}`}>{m.nombre}</button>)}
        </div>
      </div>
      <div className="row wrap">
        <Campo label="Páginas">{id => <input id={id} className="input" type="number" min={1} max={300} value={d.paginas} onChange={e => set({ paginas: Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 1)) })} data-testid="album-paginas" />}</Campo>
        <Campo label="Columnas por página">{id => <input id={id} className="input" type="number" min={1} max={6} value={d.columnas} onChange={e => set({ columnas: Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)) })} data-testid="album-columnas" />}</Campo>
        <Campo label="Filas por página">{id => <input id={id} className="input" type="number" min={1} max={6} value={d.filas} onChange={e => set({ filas: Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)) })} data-testid="album-filas" />}</Campo>
      </div>
      {nota ? <p className="small muted">{nota}</p> : <p className="small muted">{editar ? 'Si reduces el tamaño, los bolsillos que queden fuera conservan su asignación pero no se muestran.' : paginasNecesarias ? `Con ${d.columnas} × ${d.filas} hacen falta ${paginasNecesarias} páginas (${d.columnas * d.filas * d.paginas} bolsillos en total). Podrás cambiarlo después.` : `Ej.: una carpeta de ${d.columnas} × ${d.filas} con ${d.paginas} páginas tiene ${d.columnas * d.filas * d.paginas} bolsillos. Podrás cambiarlo después.`}</p>}
    </>
  );
}

/** Ventana de editar un álbum personalizado (y la de crear uno de "Cartas sueltas" desde donde se siga usando). */
export function EditorAlbumPropio({ titulo, okLabel, inicial, onClose, onGuardar }: { titulo: string; okLabel: string; inicial?: Partial<DatosAlbumPropio>; onClose: () => void; onGuardar: (d: DatosAlbumPropio) => Promise<boolean> }) {
  const [datos, setDatos] = useState<DatosAlbumPropio>(() => datosAlbumIniciales(inicial));
  const [guardando, setGuardando] = useState(false);
  const editar = !!inicial?.nombre;
  async function guardar() {
    setGuardando(true);
    const ok = await onGuardar({ ...datos, nombre: datos.nombre.trim() || inicial?.nombre || 'Álbum' });
    setGuardando(false);
    if (ok) onClose();
  }
  return (
    <Sheet titulo={titulo} onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={guardando} onClick={guardar} data-testid="btn-guardar-album">{guardando ? 'Guardando…' : okLabel}</button></>}>
      <FormularioAlbumPropio valor={datos} onChange={setDatos} editar={editar} />
    </Sheet>
  );
}
