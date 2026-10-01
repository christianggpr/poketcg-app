'use client';
import { useRef, useState } from 'react';
import { abrirReclamo, MOTIVOS_RECLAMO, type Orden, type Reclamo } from '@/lib/compras';
import { usePerfil } from './PerfilProvider';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { Aviso, Campo } from './ui';

/** Reclamo de una orden en tienda (lo abre el comprador o la cuenta de tienda): motivo, detalle y hasta 3 fotos. */
export function ReclamoSheet({ orden, porTienda, onClose, onListo }: { orden: Orden; porTienda?: boolean; onClose: () => void; onListo: () => void }) {
  const { perfil } = usePerfil();
  const toast = useToast();
  const [motivo, setMotivo] = useState<Reclamo['motivo']>('carta_distinta');
  const [detalle, setDetalle] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function enviar() {
    if (detalle.trim().length < 5) { toast('Cuéntanos qué pasó (al menos unas palabras)', 'danger'); return; }
    setEnviando(true);
    const r = await abrirReclamo(perfil.id, orden.id, motivo, detalle.trim(), fotos);
    setEnviando(false);
    if (!r.ok) { toast(r.error || 'No se pudo enviar el reclamo', 'danger', 4000); return; }
    toast(`Reclamo #${r.numero} enviado: lo revisamos y te avisamos`, 'ok', 4500);
    onListo();
  }
  return (
    <Sheet titulo={`Reclamo de la orden #${orden.numero}`} onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={enviando} onClick={enviar} data-testid="btn-enviar-reclamo">{enviando ? 'Enviando…' : 'Enviar reclamo'}</button></>}>
      <Aviso tipo="info">{porTienda ? 'El comprador revisó las cartas y no está conforme. Deja el sobre en la tienda: el administrador resolverá.' : 'Revisa las cartas en la tienda antes de llevártelas. Si algo no está bien, no te las lleves: déjalas en la tienda y envía este reclamo con fotos. Lo revisamos y, si procede, el dinero vuelve a tu saldo.'}</Aviso>
      <Campo label="¿Qué pasó?">{id => <select id={id} className="input" value={motivo} onChange={e => setMotivo(e.target.value as Reclamo['motivo'])} data-testid="select-motivo-reclamo">{(Object.keys(MOTIVOS_RECLAMO) as Reclamo['motivo'][]).map(m => <option key={m} value={m}>{MOTIVOS_RECLAMO[m]}</option>)}</select>}</Campo>
      <Campo label="Cuéntanos el detalle" ayuda="Qué carta, qué viste, qué esperabas.">{id => <textarea id={id} className="input" rows={3} value={detalle} onChange={e => setDetalle(e.target.value.slice(0, 1000))} data-testid="input-detalle-reclamo" />}</Campo>
      <div className="field">
        <label>Fotos (hasta 3, opcionales pero recomendadas)</label>
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <button className="btn sm" onClick={() => input.current?.click()} disabled={fotos.length >= 3}>📷 Agregar foto</button>
          <input ref={input} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setFotos(x => [...x, f].slice(0, 3)); e.target.value = ''; }} data-testid="input-foto-reclamo" />
          {fotos.map((f, i) => <span key={i} className="small">{f.name.slice(0, 24)} <button className="btn sm ghost" onClick={() => setFotos(x => x.filter((_, j) => j !== i))}>Quitar</button></span>)}
        </div>
      </div>
    </Sheet>
  );
}
