'use client';
import { useState } from 'react';
import { MARCAS_AGUA, type IdMarcaAgua } from '@/lib/patrones';
import { COLORES_PORTADA, colorPortada, marcaAgua } from '@/lib/portadas';
import { Icono } from './Icono';
import { PortadaPropia } from './Portadas';
import { Sheet } from './Sheet';
import { Campo } from './ui';

export type DatosAlbumPropio = { nombre: string; descripcion: string; paginas: number; columnas: number; filas: number; color: string; marca_agua: IdMarcaAgua };

/**
 * Mejoras 3 · A (maqueta M3-Nuevo): crear o editar un álbum personalizado con vista previa en vivo de la portada,
 * nombre, 8 colores, marca de agua (emblema PokéTCG, un patrón o ninguna) y el tamaño de las casillas.
 */
export function EditorAlbumPropio({ titulo, okLabel, inicial, onClose, onGuardar }: { titulo: string; okLabel: string; inicial?: Partial<DatosAlbumPropio>; onClose: () => void; onGuardar: (d: DatosAlbumPropio) => Promise<boolean> }) {
  const [nombre, setNombre] = useState(inicial?.nombre || '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion || '');
  const [paginas, setPaginas] = useState(inicial?.paginas || 10);
  const [columnas, setColumnas] = useState(inicial?.columnas || 3);
  const [filas, setFilas] = useState(inicial?.filas || 3);
  const [color, setColor] = useState(colorPortada(inicial?.color));
  const [marca, setMarca] = useState<IdMarcaAgua>(marcaAgua(inicial?.marca_agua));
  const [guardando, setGuardando] = useState(false);
  const editar = !!inicial?.nombre;
  async function guardar() {
    setGuardando(true);
    const ok = await onGuardar({ nombre: nombre.trim() || inicial?.nombre || 'Álbum', descripcion, paginas, columnas, filas, color, marca_agua: marca });
    setGuardando(false);
    if (ok) onClose();
  }
  return (
    <Sheet titulo={titulo} onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={guardando} onClick={guardar} data-testid="btn-guardar-album">{guardando ? 'Guardando…' : okLabel}</button></>}>
      <PortadaPropia nombre={nombre} color={color} marca={marca} grande subtitulo="Vista previa de la portada" />
      <Campo label="Nombre">{id => <input id={id} className="input" autoFocus={!editar} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Charmander, Mis favoritas, Carpeta azul…" data-testid="album-nombre" />}</Campo>
      {editar ? <Campo label="Descripción">{id => <input id={id} className="input" value={descripcion} onChange={e => setDescripcion(e.target.value)} />}</Campo> : null}
      <div className="field">
        <label>Color de la portada</label>
        <div className="colores-portada" role="radiogroup" aria-label="Color de la portada" data-testid="colores-portada">
          {COLORES_PORTADA.map(c => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} className={`color-portada ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} data-testid={`color-${c.slice(1).toLowerCase()}`}>{color === c ? <Icono n="ok" tam={18} grosor={3} /> : null}</button>)}
        </div>
      </div>
      <div className="field">
        <label>Marca de agua</label>
        <div className="seg marcas-agua" role="radiogroup" aria-label="Marca de agua" data-testid="marcas-agua">
          {MARCAS_AGUA.map(m => <button key={m.id} type="button" role="radio" aria-checked={marca === m.id} className={marca === m.id ? 'active' : ''} onClick={() => setMarca(m.id)} data-testid={`marca-${m.id}`}>{m.nombre}</button>)}
        </div>
      </div>
      <div className="row wrap">
        <Campo label="Páginas">{id => <input id={id} className="input" type="number" min={1} max={300} value={paginas} onChange={e => setPaginas(Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 1)))} />}</Campo>
        <Campo label="Columnas por página">{id => <input id={id} className="input" type="number" min={1} max={6} value={columnas} onChange={e => setColumnas(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />}</Campo>
        <Campo label="Filas por página">{id => <input id={id} className="input" type="number" min={1} max={6} value={filas} onChange={e => setFilas(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />}</Campo>
      </div>
      <p className="small muted">{editar ? 'Si reduces el tamaño, los bolsillos que queden fuera conservan su asignación pero no se muestran.' : `Ej.: una carpeta de ${columnas} × ${filas} con ${paginas} páginas tiene ${columnas * filas * paginas} bolsillos. Podrás cambiarlo después.`}</p>
    </Sheet>
  );
}
