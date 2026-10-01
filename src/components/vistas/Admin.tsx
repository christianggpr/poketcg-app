'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CATALOGO_VERSION, type DatosCatalogo } from '@/lib/catalogo';
import { useSearchParams } from 'next/navigation';
import { Aviso } from '../ui';
import { AdminMercado } from './AdminMercado';
import { AdminAjustesPagos, AdminOrdenes, AdminPagos, AdminRetiros, AdminTiendas, AdminVerificaciones, AdminWhatsApp } from './AdminFase3';
import { AdminReclamos, AdminReportes, AdminUsuarios } from './AdminFase4';

const PESTANAS: [string, string][] = [['pagos', '🧾 Pagos'], ['ordenes', '📦 Órdenes'], ['reclamos', '📝 Reclamos'], ['retiros', '💰 Pagos a vendedores'], ['tiendas', '🏪 Tiendas'], ['usuarios', '👥 Usuarios'], ['verificaciones', '📱 Celulares'], ['whatsapp', '📲 WhatsApp'], ['cobros', '💳 Cobros y pagos'], ['reportes', '📊 Reportes'], ['mercado', '📈 Precios y tareas'], ['catalogo', '🗂️ Catálogo']];

type Resumen = { colecciones: number; cartas: number; usuarios: number };

export function AdminPanel() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'pagos');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  const [progreso, setProgreso] = useState<{ hecho: number; total: number; texto: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);

  async function cargarResumen() {
    const r = await fetch('/api/admin/catalogo');
    const j = await r.json().catch(() => ({}));
    if (j.ok) setResumen(j); else setError(j.error || 'No se pudo leer el resumen');
  }
  useEffect(() => { cargarResumen(); }, []);

  async function cargarCatalogo() {
    setError(''); setLog([]);
    setProgreso({ hecho: 0, total: 1, texto: 'Descargando catalogo.json…' });
    const r = await fetch(`/data/catalogo.json?v=${encodeURIComponent(CATALOGO_VERSION)}`);
    const datos = (await r.json()) as DatosCatalogo;
    const lotes: { sets?: unknown[]; cards?: unknown[] }[] = [];
    for (let i = 0; i < datos.sets.length; i += 300) lotes.push({ sets: datos.sets.slice(i, i + 300) });
    for (let i = 0; i < datos.cards.length; i += 1000) lotes.push({ cards: datos.cards.slice(i, i + 1000) });
    let hecho = 0;
    for (const lote of lotes) {
      setProgreso({ hecho, total: lotes.length, texto: lote.sets ? `Colecciones… (${lote.sets.length})` : `Cartas… lote ${hecho + 1} de ${lotes.length}` });
      let intento = 0, ok = false, msg = '';
      while (intento < 3 && !ok) {
        intento++;
        try {
          const rr = await fetch('/api/admin/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lote) });
          const j = await rr.json().catch(() => ({}));
          if (j.ok) ok = true; else msg = j.error || `HTTP ${rr.status}`;
        } catch (e) { msg = e instanceof Error ? e.message : String(e); }
        if (!ok) await new Promise(res => setTimeout(res, 1500 * intento));
      }
      if (!ok) { setError(`Falló el lote ${hecho + 1}: ${msg}. Puedes volver a pulsar "Cargar catálogo": continúa donde quedó (los lotes ya cargados solo se actualizan).`); setProgreso(null); return; }
      hecho++;
      setLog(l => [...l.slice(-8), `✓ lote ${hecho}/${lotes.length}`]);
    }
    try {
      const rr = await fetch('/api/admin/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limpiar: true, conservar: datos.cards.filter(c => c.sd).map(c => c.id) }) });
      const j = await rr.json().catch(() => ({}));
      if (j.ok && j.borradas) setLog(l => [...l, `✓ ${j.borradas} casillas "sin datos" antiguas eliminadas`]);
    } catch { /* la limpieza es opcional */ }
    setProgreso(null);
    setLog(l => [...l, `Catálogo ${datos.version} cargado: ${datos.sets.length} colecciones, ${datos.cards.length} cartas.`]);
    cargarResumen();
  }

  return (
    <div className="view">
      <p className="small"><Link href="/app">← Volver a la app</Link></p>
      <h2>Administración</h2>
      {error ? <Aviso tipo="danger">{error}</Aviso> : null}
      <div className="stat">
        <div className="box"><b>{resumen ? resumen.usuarios : '…'}</b><span>usuarios registrados</span></div>
        <div className="box"><b>{resumen ? resumen.colecciones : '…'}</b><span>colecciones en la base</span></div>
        <div className="box"><b>{resumen ? resumen.cartas.toLocaleString('es-PE') : '…'}</b><span>cartas en la base</span></div>
      </div>
      <div className="seg" style={{ flexWrap: 'wrap', margin: '10px 0' }} data-testid="admin-tabs">{PESTANAS.map(([v, l]) => <button key={v} className={tab === v ? 'active' : ''} onClick={() => { setTab(v); history.replaceState(null, '', '/admin?tab=' + v); }}>{l}</button>)}</div>
      {tab === 'pagos' ? <AdminPagos /> : null}
      {tab === 'ordenes' ? <AdminOrdenes /> : null}
      {tab === 'retiros' ? <AdminRetiros /> : null}
      {tab === 'tiendas' ? <AdminTiendas /> : null}
      {tab === 'usuarios' ? <AdminUsuarios /> : null}
      {tab === 'reclamos' ? <AdminReclamos /> : null}
      {tab === 'reportes' ? <AdminReportes /> : null}
      {tab === 'verificaciones' ? <AdminVerificaciones /> : null}
      {tab === 'whatsapp' ? <AdminWhatsApp /> : null}
      {tab === 'cobros' ? <AdminAjustesPagos /> : null}
      {tab === 'catalogo' ? <div className="panel">
        <h3>Catálogo de cartas</h3>
        <p className="small muted">La app trae el catálogo en el archivo <span className="mono">public/data/catalogo.json</span> (versión <b>{CATALOGO_VERSION}</b>). Este botón lo copia a la base de datos de Supabase (necesario para guardar cartas y consultar precios). Tarda 1–3 minutos; repítelo cada vez que se publique una versión nueva del catálogo.</p>
        <button className="btn primary" onClick={cargarCatalogo} disabled={!!progreso}>{progreso ? 'Cargando…' : 'Cargar catálogo en la base de datos'}</button>
        {progreso ? <div style={{ marginTop: 10 }}><div className="bar"><div style={{ width: Math.round((progreso.hecho / progreso.total) * 100) + '%' }} /></div><p className="small muted">{progreso.texto}</p></div> : null}
        {log.length ? <pre className="mono small" style={{ whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre> : null}
      </div> : null}
      {tab === 'mercado' ? <AdminMercado /> : null}
    </div>
  );
}
