'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { APP_NAME, APP_VERSION, IDIOMAS_CARTA } from '@/lib/config';
import { CATALOGO_VERSION, nombreCarta, rarezaLabel } from '@/lib/catalogo';
import { cajasOrdenadas, nombreEntrada, numeroEntrada, coleccionEntrada } from '@/lib/coleccion';
import { ocultarDni, validarPerfil } from '@/lib/validar';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { Campo, Aviso } from '../ui';
import { Reconocimiento } from './Reconocimiento';

export function Ajustes() {
  const { perfil, setPerfil } = usePerfil();
  const col = useColeccion();
  const toast = useToast();
  const [d, setD] = useState({ nombres: perfil.nombres, apellidos: perfil.apellidos, username: perfil.username, telefono: perfil.telefono || '', idioma_nombres: perfil.idioma_nombres });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  async function guardarPerfil(ev: React.FormEvent) {
    ev.preventDefault();
    const v = validarPerfil(d);
    if (!v.ok) { setErrores(v.errores as Record<string, string>); return; }
    setErrores({}); setGuardando(true);
    const r = await fetch('/api/perfil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v.datos) });
    const j = await r.json().catch(() => ({}));
    setGuardando(false);
    if (j.ok) { setPerfil({ ...perfil, ...v.datos, telefono: v.datos.telefono || null }); toast('Perfil guardado', 'ok'); }
    else if (j.errores) setErrores(j.errores); else toast(j.error || 'No se pudo guardar', 'danger');
  }

  return (
    <div>
      <h2>Ajustes</h2>
      <div className="panel">
        <h3>Tu cuenta</h3>
        <form onSubmit={guardarPerfil} className="stack" noValidate>
          <div className="form-grid">
            <Campo label="Nombres" error={errores.nombres}>{id => <input id={id} className="input" value={d.nombres} onChange={e => setD(x => ({ ...x, nombres: e.target.value }))} />}</Campo>
            <Campo label="Apellidos" error={errores.apellidos}>{id => <input id={id} className="input" value={d.apellidos} onChange={e => setD(x => ({ ...x, apellidos: e.target.value }))} />}</Campo>
            <Campo label="Nombre de usuario" error={errores.username}>{id => <input id={id} className="input" value={d.username} onChange={e => setD(x => ({ ...x, username: e.target.value.replace(/\s/g, '') }))} />}</Campo>
            <Campo label="Celular" error={errores.telefono}>{id => <input id={id} className="input" inputMode="numeric" maxLength={9} value={d.telefono} onChange={e => setD(x => ({ ...x, telefono: e.target.value.replace(/\D/g, '') }))} />}</Campo>
            <Campo label="Correo" ayuda="Para cambiarlo escríbenos a info@poketcg.pe.">{id => <input id={id} className="input" value={perfil.email} readOnly />}</Campo>
            <Campo label="DNI" ayuda="Solo tú lo ves. No se puede editar desde la app.">{id => <input id={id} className="input" value={ocultarDni(perfil.dni)} readOnly />}</Campo>
          </div>
          <Campo label="Idioma principal de los nombres de las cartas" ayuda="Los demás idiomas se muestran en pequeño.">{id => <select id={id} className="input" value={d.idioma_nombres} onChange={e => setD(x => ({ ...x, idioma_nombres: e.target.value as 'es' | 'en' | 'ja' }))}><option value="es">Español</option><option value="en">Inglés</option><option value="ja">Japonés</option></select>}</Campo>
          <div className="row"><button className="btn primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar perfil'}</button></div>
        </form>
      </div>

      <div className="panel">
        <h3>Mercado</h3>
        <p className="small muted">Tus publicaciones, precios, fotos y estados se administran desde «Mis ventas». Los compradores solo ven tu nombre de usuario (@{perfil.username}).</p>
        <Link href="/app/ventas" className="btn sm">🏷️ Ir a Mis ventas{col.publicaciones.length ? ` (${col.publicaciones.length})` : ''}</Link>
      </div>

      <Reconocimiento />

      <IdiomaCartas />

      <Respaldo />

      <div className="panel">
        <h3>Sesión</h3>
        <p className="small muted">Sesión iniciada como <b>@{perfil.username}</b> ({perfil.email}).</p>
        <form action="/api/auth/salir" method="post"><button className="btn">Cerrar sesión</button></form>
      </div>
      <p className="small muted">{APP_NAME} {APP_VERSION} · catálogo {CATALOGO_VERSION} · {col.entradas.length} entradas.</p>
    </div>
  );
}

function IdiomaCartas() {
  const cat = useCatalogo();
  const col = useColeccion();
  const toast = useToast();
  const [idioma, setIdioma] = useState('ES');
  const [guardando, setGuardando] = useState(false);
  const sinIdioma = col.entradas.filter(e => { const c = cat.carta(e.carta_id); return !e.idioma && !(c && cat.setOf(c)?.rg === 'ja'); });
  if (!sinIdioma.length) return null;
  const unidades = sinIdioma.reduce((n, e) => n + e.cantidad, 0);
  return (
    <div className="panel">
      <h3>Idioma de las cartas</h3>
      <p className="small muted">{unidades} {unidades === 1 ? 'carta no tiene' : 'cartas no tienen'} idioma registrado ({sinIdioma.length} {sinIdioma.length === 1 ? 'entrada' : 'entradas'}). Los álbumes se separan por idioma, así que conviene marcarlo. Si toda tu colección es del mismo idioma, hazlo aquí de una vez; si mezclas idiomas, mejor desde cada álbum (Álbum → colección "sin idioma").</p>
      <div className="row" style={{ gap: 6 }}>
        <select className="input sm" value={idioma} onChange={e => setIdioma(e.target.value)}>{IDIOMAS_CARTA.filter(l => l !== 'JP').map(l => <option key={l} value={l}>{l}</option>)}</select>
        <button className="btn sm primary" disabled={guardando} onClick={async () => { setGuardando(true); const n = await col.editarVarias(sinIdioma.map(e => e.id), { idioma }); setGuardando(false); toast(`${n} entradas marcadas como ${idioma}`, 'ok'); }}>{guardando ? 'Guardando…' : `Marcar todas como ${idioma}`}</button>
      </div>
    </div>
  );
}

type RespaldoV1 = { boxes: { id: string; name: string; desc?: string; order?: number; mode?: string; setOrder?: string }[]; entries: Record<string, unknown>[] };

function Respaldo() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const toast = useToast();
  const archivo = useRef<HTMLInputElement>(null);
  const [pendiente, setPendiente] = useState<RespaldoV1 | null>(null);
  const [progreso, setProgreso] = useState('');
  const [resultado, setResultado] = useState('');
  const idioma = perfil.idioma_nombres;

  async function leer(f: File) {
    try {
      const data = JSON.parse(await f.text());
      const st = data.state || data;
      if (!st || !Array.isArray(st.boxes) || !Array.isArray(st.entries)) throw new Error('formato');
      setPendiente({ boxes: st.boxes, entries: st.entries });
    } catch {
      toast('El archivo no es un respaldo válido de PokéBóveda', 'danger');
    }
  }
  async function importar(modo: 'reemplazar' | 'combinar') {
    if (!pendiente) return;
    const r = pendiente; setPendiente(null); setResultado('');
    setProgreso('Creando cajas…');
    const r1 = await fetch('/api/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paso: 'cajas', modo, cajas: r.boxes }) });
    const j1 = await r1.json().catch(() => ({}));
    if (!j1.ok) { setProgreso(''); toast(j1.error || 'No se pudieron importar las cajas', 'danger'); return; }
    let insertadas = 0, sinCatalogo = 0;
    for (let i = 0; i < r.entries.length; i += 400) {
      setProgreso(`Guardando cartas… ${Math.min(i + 400, r.entries.length)} de ${r.entries.length}`);
      const r2 = await fetch('/api/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paso: 'entradas', mapa: j1.mapa, entradas: r.entries.slice(i, i + 400) }) });
      const j2 = await r2.json().catch(() => ({}));
      if (!j2.ok) { setProgreso(''); toast(j2.error || 'Error al guardar las cartas', 'danger'); await col.recargar(); return; }
      insertadas += j2.insertadas; sinCatalogo += j2.sinCatalogo;
    }
    setProgreso('');
    await col.recargar();
    setResultado(`Importación terminada: ${insertadas} cartas${sinCatalogo ? ` (${sinCatalogo} no estaban en el catálogo y se guardaron como personalizadas)` : ''}.`);
    toast('Respaldo importado', 'ok');
  }

  const exportarJson = () => {
    const payload = { app: 'poketcg', v: 2, exportedAt: new Date().toISOString(), usuario: perfil.username, cajas: col.cajas, entradas: col.entradas, albumes: col.albumes };
    descargar(`poketcg-respaldo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 1), 'application/json');
  };
  const exportarCsv = () => {
    const filas: (string | number)[][] = [['Caja', 'Posición', 'Colección', 'Número', 'Nombre', 'Cantidad', 'Acabado', 'Idioma', 'Estado', 'Rareza', 'Precio unitario S/', 'Total S/', 'Mercado S/', 'Mercado USD', 'Id', 'Nota']];
    for (const caja of cajasOrdenadas(col.cajas)) {
      for (const p of ubicador.posiciones(caja).lista) {
        const e = p.entrada; const c = cat.carta(e.carta_id); const d = c && !c.sd ? precios.precioDefecto(c, e.acabado) : null; const v = precios.valor(c, e.acabado);
        filas.push([caja.nombre, p.idx, coleccionEntrada(cat, e, idioma), numeroEntrada(cat, e), c ? nombreCarta(c, idioma) : nombreEntrada(cat, e, idioma), e.cantidad, e.acabado, e.idioma, e.condicion, c ? rarezaLabel(c.r) : '', d ? d.pen : '', d ? Math.round(d.pen * e.cantidad * 100) / 100 : '', d && d.mercado ? d.mercado.pen : '', v ? v.usd : '', c ? c.id : '', e.nota]);
      }
    }
    for (const e of col.entradas.filter(x => !x.caja_id)) { const c = cat.carta(e.carta_id); const d = c && !c.sd ? precios.precioDefecto(c, e.acabado) : null; filas.push(['(sin caja)', '', coleccionEntrada(cat, e, idioma), numeroEntrada(cat, e), nombreEntrada(cat, e, idioma), e.cantidad, e.acabado, e.idioma, e.condicion, c ? rarezaLabel(c.r) : '', d ? d.pen : '', d ? Math.round(d.pen * e.cantidad * 100) / 100 : '', d && d.mercado ? d.mercado.pen : '', '', c ? c.id : '', e.nota]); }
    const csv = '﻿' + filas.map(f => f.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    descargar(`poketcg-coleccion-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  };
  const [total] = useMemo(() => [col.entradas.reduce((n, e) => n + e.cantidad, 0)], [col.entradas]);

  return (
    <div className="panel">
      <h3>Respaldo e importación</h3>
      <p className="small muted">Tu colección se guarda en la nube y se sincroniza entre tus dispositivos. Aun así, exporta un respaldo de vez en cuando ({total} cartas).</p>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn primary sm" onClick={exportarJson}>⬇️ Exportar respaldo (.json)</button>
        <button className="btn sm" onClick={exportarCsv}>⬇️ Exportar listado (.csv)</button>
        <button className="btn sm" onClick={() => archivo.current?.click()}>⬆️ Importar respaldo de PokéBóveda v1</button>
        <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
      </div>
      {progreso ? <p className="small"><span className="spinner" /> {progreso}</p> : null}
      {resultado ? <Aviso tipo="ok">{resultado}</Aviso> : null}
      {pendiente ? (
        <Sheet titulo="Importar respaldo" onClose={() => setPendiente(null)}>
          <p className="muted">El archivo tiene <b>{pendiente.boxes.length}</b> cajas y <b>{pendiente.entries.length}</b> cartas.</p>
          <div className="stack">
            <button className="btn primary" onClick={() => importar('reemplazar')}>Reemplazar mi colección actual</button>
            <button className="btn" onClick={() => importar('combinar')}>Combinar (añadir a lo que ya tengo)</button>
            <button className="btn ghost" onClick={() => setPendiente(null)}>Cancelar</button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function descargar(nombre: string, contenido: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
