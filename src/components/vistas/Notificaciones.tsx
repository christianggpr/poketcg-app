'use client';
import { Icono, type NombreIcono } from '../Icono';
import { useEffect } from 'react';
import Link from 'next/link';
import { fechaHora } from '@/lib/compras';
import { useNotificaciones } from '../NotificacionesProvider';

const ICONO: Record<string, NombreIcono> = { pago_revision: 'recibo', comprobante_recibido: 'recibo', pago_confirmado: 'ok_circulo', pago_rechazado: 'aviso', pago_vencido: 'reloj', venta_confirmada: 'ventas', orden_por_llegar: 'bulk', en_tienda: 'tienda', entregada: 'fiesta', saldo_liberado: 'cartera', retiro_pagado: 'billete', celular_verificado: 'celular', celular_rechazado: 'celular', recordatorio: 'campana', orden_vencida: 'alerta', favorito: 'corazon', resena: 'estrella' };

/** Bandeja de notificaciones: se marcan como leídas al abrir la página. */
export function Notificaciones() {
  const notif = useNotificaciones();
  useEffect(() => { if (notif.noLeidas) notif.marcarLeidas(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [notif.cargado]);
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Notificaciones</h2>
      {!notif.cargado ? <p className="muted small"><span className="spinner" /> Cargando…</p> : null}
      {notif.cargado && !notif.lista.length ? <div className="empty"><div className="big"><Icono n="campana" tam={44} grosor={1.5} /></div><p><b>Todavía no tienes avisos.</b></p><p className="muted">Aquí verás tus compras, ventas, pagos y retiros.</p></div> : null}
      <div className="card-list">
        {notif.lista.map(n => (
          <div key={n.id} className="card-row" style={{ cursor: n.enlace ? 'pointer' : 'default', opacity: n.leida_en ? 0.8 : 1 }} data-testid="notificacion">
            <div className="notif-ico"><Icono n={ICONO[n.tipo] || 'campana'} tam={22} /></div>
            <div className="card-main">
              <div className="card-name">{n.titulo}{!n.leida_en ? <span className="pill primary" style={{ marginLeft: 6 }}>nuevo</span> : null}</div>
              <div className="small" style={{ whiteSpace: 'pre-line' }}>{n.cuerpo}</div>
              <div className="small muted">{fechaHora(n.creada)}{n.enlace ? <> · <Link href={n.enlace}>Abrir</Link></> : null}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
