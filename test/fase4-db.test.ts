/**
 * Fase 4 · reglas de negocio en la base: reputación (reseñas, insignias), suspensión de cuentas.
 * Usa PostgreSQL local con las migraciones reales (test/db/reiniciar.sh); si no responde, se omite.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5432/poketcg_test';
pg.types.setTypeParser(1700, v => (v == null ? null : parseFloat(v)));
pg.types.setTypeParser(20, v => (v == null ? null : parseInt(v, 10)));
pg.types.setTypeParser(1082, v => v);

let pool: pg.Pool | null = null;
const ids = { vendedor: 'a4a4a4a4-0001-4000-8000-000000000001', comprador: 'a4a4a4a4-0002-4000-8000-000000000002', otro: 'a4a4a4a4-0003-4000-8000-000000000003', admin: 'a4a4a4a4-0004-4000-8000-000000000004' };
let tienda = '';

async function q<T = Record<string, unknown>>(sql: string, vals: unknown[] = []): Promise<T[]> { return (await pool!.query(sql, vals)).rows as T[]; }
async function como<T>(uid: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool!.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claim.role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [uid ? 'authenticated' : 'anon', uid || '']);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
const rpc = (uid: string | null, fn: string, args: unknown[]) => como(uid, async c => (await c.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args)).rows[0].r as Record<string, unknown>);

before(async () => {
  const p = new pg.Pool({ connectionString: DB, max: 4, connectionTimeoutMillis: 3000 });
  try { await p.query('select 1'); pool = p; } catch { await p.end().catch(() => {}); return; }
  const todos = Object.values(ids);
  await q(`delete from auth.users where id = any($1::uuid[])`, [todos]);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'f4-vendedor@poketcg.pe', '{"username":"f4_vendedor","nombres":"Vera","apellidos":"Vega","telefono":"911111144","dni":"41111111","acepto_terminos":true}'),
    ($2, 'f4-comprador@poketcg.pe', '{"username":"f4_comprador","nombres":"Camilo","apellidos":"Cruz","telefono":"922222244","dni":"42222222","acepto_terminos":true}'),
    ($3, 'f4-otro@poketcg.pe', '{"username":"f4_otro","nombres":"Olga","apellidos":"Ortiz","telefono":"933333344","dni":"43333333","acepto_terminos":true}'),
    ($4, 'f4-admin@poketcg.pe', '{"username":"f4_admin","nombres":"Ada","apellidos":"Admin","telefono":"944444444","dni":"44444444","acepto_terminos":true}')`, [ids.vendedor, ids.comprador, ids.otro, ids.admin]);
  await q(`update public.perfiles set rol = 'admin' where id = $1`, [ids.admin]);
  await q(`insert into public.colecciones_tcg (id, nombre, region, total_cartas, total_impreso, fecha, abreviatura) values ('tst4', 'Colección F4', 'int', 2, 2, '2024-01-01', 'TS4') on conflict (id) do nothing`);
  await q(`insert into public.cartas (id, coleccion_id, numero, nombre, rareza, sin_datos) values ('tst4-1', 'tst4', '1', 'Snorlax', 'Rare', false), ('tst4-2', 'tst4', '2', 'Munchlax', 'Common', false) on conflict (id) do nothing`);
  await q(`delete from public.tiendas where nombre = 'Tienda F4'`);
  tienda = (await q<{ id: string }>(`insert into public.tiendas (nombre, distrito, direccion, horario, dias_abierto) values ('Tienda F4', 'Lince', 'Av. Arenales 1624', 'L–S 12:00–20:00', '{1,2,3,4,5,6}') returning id`))[0].id;
});
after(async () => {
  if (!pool) return;
  await q(`delete from auth.users where id = any($1::uuid[])`, [Object.values(ids)]);
  await q(`delete from public.tiendas where id = $1`, [tienda]);
  await q(`delete from public.precios where carta_id like 'tst4-%'`);
  await q(`delete from public.colecciones_tcg where id = 'tst4'`);
  await pool.end();
});
const conBase = (t: { skip: (m?: string) => void }) => { if (!pool) { t.skip('sin PostgreSQL local'); return false; } return true; };

async function publicar(carta: string, cantidad: number, precio: number, vendedor = ids.vendedor, enVenta = false): Promise<{ pub: string; caja: string; entrada: string }> {
  const caja = await como(vendedor, async c => (await c.query(`insert into public.cajas (nombre, orden, en_venta) values ('Caja F4', 1, $1) returning id`, [enVenta])).rows[0].id as string);
  const entrada = await como(vendedor, async c => (await c.query(`insert into public.entradas (carta_id, caja_id, cantidad, acabado, idioma, condicion) values ($1, $2, $3, 'Normal', 'ES', 'NM') returning id`, [carta, caja, cantidad])).rows[0].id as string);
  let pub: string;
  if (enVenta) pub = (await q<{ id: string }>(`select id from public.publicaciones where entrada_id = $1`, [entrada]))[0].id;
  else pub = await como(vendedor, async c => (await c.query(`insert into public.publicaciones (entrada_id, cantidad, tipo_precio, precio_pen) values ($1, $2, 'manual', $3) returning id`, [entrada, cantidad, precio])).rows[0].id as string);
  return { pub, caja, entrada };
}
/** Compra y entrega completa de `cantidad` copias; devuelve la orden. */
async function venderYEntregar(carta: string, copias: number, precio: number, cantidad: number, comprador = ids.comprador, opts: { fechaHoras?: number; entregaTarde?: boolean } = {}) {
  const { pub } = await publicar(carta, copias, precio);
  assert.equal((await rpc(comprador, 'reservar_copia', [pub, cantidad])).ok, true);
  const pago = await rpc(comprador, 'crear_pago', [tienda, false]);   // sin usar el saldo: siempre con comprobante
  assert.equal(pago.ok, true, JSON.stringify(pago));
  const comp = await rpc(comprador, 'subir_comprobante', [pago.pago_id, 'https://x/v.jpg', 'OP' + Date.now() + Math.random()]);
  assert.equal(comp.ok, true, JSON.stringify(comp));
  assert.equal((await rpc(ids.admin, 'revisar_pago', [pago.pago_id, 'confirmar', null])).ok, true);
  const orden = (await q<{ id: string; fecha_limite: string; codigo_retiro: string }>(`select id, fecha_limite::text, codigo_retiro from public.ordenes where pago_id = $1`, [pago.pago_id]))[0];
  assert.equal((await rpc(ids.vendedor, 'elegir_fecha_entrega', [orden.id, orden.fecha_limite])).ok, true);
  if (opts.fechaHoras != null) await q(`update public.ordenes set fecha_elegida_en = pago_confirmado_en + make_interval(hours => $2) where id = $1`, [orden.id, opts.fechaHoras]);
  assert.equal((await rpc(ids.vendedor, 'marcar_en_tienda', [orden.id, 'https://x/e.jpg'])).ok, true);
  if (opts.entregaTarde) await q(`update public.ordenes set en_tienda_en = (fecha_limite + 2)::timestamptz where id = $1`, [orden.id]);
  assert.equal((await rpc(comprador, 'marcar_entregada', [orden.id, null, null])).ok, true);
  return orden;
}

test('reseñas: solo el comprador, solo órdenes entregadas, de 1 a 5, corregible 7 días; el vendedor recibe el aviso y su reputación se actualiza', async t => {
  if (!conBase(t)) return;
  const orden = await venderYEntregar('tst4-1', 2, 10, 1);
  assert.equal((await rpc(ids.otro, 'calificar_orden', [orden.id, 5, 'x'])).ok, false, 'otro usuario no califica');
  assert.equal((await rpc(ids.comprador, 'calificar_orden', [orden.id, 6, ''])).ok, false, 'puntaje fuera de rango');
  const { pub } = await publicar('tst4-2', 1, 5);
  assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub, 1])).ok, true);
  const pagoPend = await rpc(ids.comprador, 'crear_pago', [tienda]);
  const ordenPend = (await q<{ id: string }>(`select id from public.ordenes where pago_id = $1`, [pagoPend.pago_id]))[0];
  assert.equal((await rpc(ids.comprador, 'calificar_orden', [ordenPend.id, 5, ''])).ok, false, 'solo entregadas');
  await rpc(ids.comprador, 'cancelar_pago', [pagoPend.pago_id]);
  const ok = await rpc(ids.comprador, 'calificar_orden', [orden.id, 4, 'Todo bien, carta como en la foto.']);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const r = (await q<{ puntaje: number; comentario: string }>(`select puntaje, comentario from public.resenas where orden_id = $1`, [orden.id]))[0];
  assert.deepEqual([r.puntaje, r.comentario], [4, 'Todo bien, carta como en la foto.']);
  assert.match((await q<{ titulo: string }>(`select titulo from public.notificaciones where usuario_id = $1 and tipo = 'resena' order by id desc limit 1`, [ids.vendedor]))[0].titulo, /★★★★/);
  // corrige dentro de los 7 días; no se duplica
  assert.equal((await rpc(ids.comprador, 'calificar_orden', [orden.id, 5, 'Mejor aún'])).ok, true);
  assert.equal((await q(`select 1 from public.resenas where orden_id = $1`, [orden.id])).length, 1);
  await q(`update public.resenas set creada = now() - interval '8 days' where orden_id = $1`, [orden.id]);
  assert.equal((await rpc(ids.comprador, 'calificar_orden', [orden.id, 1, 'cambio tardío'])).ok, false);
  // reputación cacheada y vista pública
  const rep = (await q<{ reputacion: { ventas: number; resenas: number; puntaje: number; insignias: string[] } }>(`select reputacion from public.perfiles where id = $1`, [ids.vendedor]))[0].reputacion;
  assert.equal(rep.ventas, 1); assert.equal(rep.resenas, 1); assert.equal(rep.puntaje, 5); assert.ok(rep.insignias.includes('nuevo'));
  const pub2 = await como(null, async c => (await c.query(`select username, reputacion->>'puntaje' as puntaje from public.vendedores_publicos where id = $1`, [ids.vendedor])).rows[0]);
  assert.deepEqual(pub2, { username: 'f4_vendedor', puntaje: '5.00' });
  const rp = await como(null, async c => (await c.query(`select comprador, puntaje, comentario from public.resenas_publicas where vendedor_id = $1`, [ids.vendedor])).rows[0]);
  assert.deepEqual(rp, { comprador: 'f4_comprador', puntaje: 5, comentario: 'Mejor aún' });
  // el vendedor responde (una vez, solo él)
  const rid = (await q<{ id: string }>(`select id from public.resenas where orden_id = $1`, [orden.id]))[0].id;
  assert.equal((await rpc(ids.comprador, 'responder_resena', [rid, 'gracias'])).ok, false);
  assert.equal((await rpc(ids.vendedor, 'responder_resena', [rid, '¡Gracias por tu compra!'])).ok, true);
  assert.equal((await q<{ respuesta: string }>(`select respuesta from public.resenas where id = $1`, [rid]))[0].respuesta, '¡Gracias por tu compra!');
});

test('insignias: confirma rápido, cumple fechas y sin faltas con 5 ventas; las órdenes vencidas restan y 2 en 90 días alertan', async t => {
  if (!conBase(t)) return;
  for (let i = 0; i < 4; i++) await venderYEntregar('tst4-1', 1, 8, 1, ids.comprador, { fechaHoras: 2 });
  let rep = (await q<{ reputacion: Record<string, unknown> }>(`select reputacion from public.perfiles where id = $1`, [ids.vendedor]))[0].reputacion;
  assert.ok((rep.ventas as number) >= 5, JSON.stringify(rep));
  const ins = rep.insignias as string[];
  assert.ok(ins.includes('rapido') && ins.includes('cumple') && ins.includes('sin_faltas') && !ins.includes('nuevo'), JSON.stringify(rep));
  assert.ok((rep.confirma_horas as number) <= 24);
  assert.equal(rep.cumple_pct, 100);
  // una entrega tardía baja el cumplimiento
  await venderYEntregar('tst4-1', 1, 8, 1, ids.comprador, { entregaTarde: true });
  rep = (await q<{ reputacion: Record<string, unknown> }>(`select reputacion from public.perfiles where id = $1`, [ids.vendedor]))[0].reputacion;
  assert.ok((rep.cumple_pct as number) < 100, JSON.stringify(rep));
  // dos órdenes vencidas en 90 días → alerta y sin la insignia "sin faltas"
  for (let i = 0; i < 2; i++) {
    const { pub } = await publicar('tst4-2', 1, 6);
    assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub, 1])).ok, true);
    const pago = await rpc(ids.comprador, 'crear_pago', [tienda]);
    await rpc(ids.comprador, 'subir_comprobante', [pago.pago_id, 'https://x/v.jpg', 'OPV' + i + Date.now()]);
    await rpc(ids.admin, 'revisar_pago', [pago.pago_id, 'confirmar', null]);
    await q(`update public.ordenes set fecha_limite = (now() at time zone 'America/Lima')::date - 1 where pago_id = $1`, [pago.pago_id]);
    await q(`select public.mantenimiento_ordenes()`);
  }
  rep = (await q<{ reputacion: Record<string, unknown> }>(`select reputacion from public.perfiles where id = $1`, [ids.vendedor]))[0].reputacion;
  assert.equal(rep.faltas_90, 2); assert.equal(rep.alerta, 'faltas'); assert.ok(!(rep.insignias as string[]).includes('sin_faltas'));
});

test('suspensión: no puede reservar ni comprar, sus publicaciones quedan pausadas y su carrito se vacía; al reactivar vuelve todo', async t => {
  if (!conBase(t)) return;
  const { pub: pubV } = await publicar('tst4-1', 2, 12);                 // publicación del vendedor
  const { pub: pubO } = await publicar('tst4-2', 2, 3, ids.otro);         // publicación de otro usuario
  assert.equal((await rpc(ids.vendedor, 'reservar_copia', [pubO, 1])).ok, true, 'antes de la suspensión reserva normal');
  assert.equal((await rpc(ids.comprador, 'suspender_usuario', [ids.vendedor, 'x'])).ok, false, 'solo el administrador');
  const s = await rpc(ids.admin, 'suspender_usuario', [ids.vendedor, 'Entregó cartas distintas a lo publicado']);
  assert.equal(s.ok, true); assert.ok((s.publicaciones_pausadas as number) >= 1);
  assert.deepEqual((await q<{ estado: string; motivo_pausa: string }>(`select estado, motivo_pausa from public.publicaciones where id = $1`, [pubV]))[0], { estado: 'pausada', motivo_pausa: 'suspension' });
  assert.equal((await q(`select 1 from public.reservas where comprador_id = $1 and estado = 'activa'`, [ids.vendedor])).length, 0, 'su carrito se vació');
  await assert.rejects(rpc(ids.vendedor, 'reservar_copia', [pubO, 1]), /suspendida/);
  // no puede volver a activar sus publicaciones ni publicar nuevas (nacen pausadas)
  await como(ids.vendedor, c => c.query(`update public.publicaciones set estado = 'activa' where id = $1`, [pubV]));
  assert.equal((await q<{ estado: string }>(`select estado from public.publicaciones where id = $1`, [pubV]))[0].estado, 'pausada');
  const { pub: pubNueva } = await publicar('tst4-2', 1, 4, ids.vendedor, true);
  assert.equal((await q<{ estado: string }>(`select estado from public.publicaciones where id = $1`, [pubNueva]))[0].estado, 'pausada');
  assert.equal((await q<{ estado: string; motivo: string }>(`select estado, suspendido_motivo as motivo from public.perfiles where id = $1`, [ids.vendedor]))[0].estado, 'suspendido');
  assert.match((await q<{ cuerpo: string }>(`select cuerpo from public.notificaciones where usuario_id = $1 and tipo = 'cuenta_suspendida' order by id desc limit 1`, [ids.vendedor]))[0].cuerpo, /cartas distintas/);
  // el usuario no puede quitarse la suspensión él mismo
  await como(ids.vendedor, c => c.query(`update public.perfiles set estado = 'activo' where id = $1`, [ids.vendedor]));
  assert.equal((await q<{ estado: string }>(`select estado from public.perfiles where id = $1`, [ids.vendedor]))[0].estado, 'suspendido');
  // reactivar
  const r = await rpc(ids.admin, 'reactivar_usuario', [ids.vendedor]);
  assert.equal(r.ok, true); assert.ok((r.publicaciones_reactivadas as number) >= 2);
  assert.equal((await q<{ estado: string }>(`select estado from public.publicaciones where id = $1`, [pubV]))[0].estado, 'activa');
  assert.equal((await rpc(ids.vendedor, 'reservar_copia', [pubO, 1])).ok, true);
  await rpc(ids.vendedor, 'liberar_reserva', [(await q<{ id: string }>(`select id from public.reservas where comprador_id = $1 and estado = 'activa'`, [ids.vendedor]))[0].id]);
});

// ---------------------------------------------------------------------------------------------
// B · plazos, anulación por el comprador, saldo del comprador, reclamos
// ---------------------------------------------------------------------------------------------
const saldoDe = async (uid: string) => (await q<{ s: number }>(`select public.saldo_de($1) as s`, [uid]))[0].s;

test('plazos: modo "dias" (7 días desde el pago) por defecto; modo "sabado" conserva la regla de la Fase 3', async t => {
  if (!conBase(t)) return;
  const modo = (await q<{ m: string }>(`select valor->>'modo_limite' as m from public.ajustes_globales where clave = 'pagos'`))[0].m;
  assert.equal(modo, 'dias');
  assert.equal((await q<{ d: string }>(`select public.fecha_limite_entrega('2026-09-30T15:00:00-05:00'::timestamptz)::text as d`))[0].d, '2026-10-07');
  await q(`update public.ajustes_globales set valor = valor || '{"modo_limite":"sabado"}' where clave = 'pagos'`);
  try {
    assert.equal((await q<{ d: string }>(`select public.fecha_limite_entrega('2026-09-30T15:00:00-05:00'::timestamptz)::text as d`))[0].d, '2026-10-03');
  } finally { await q(`update public.ajustes_globales set valor = valor || '{"modo_limite":"dias"}' where clave = 'pagos'`); }
});

test('anulación por el comprador: solo cuando el vendedor no eligió fecha en 48 h o no entregó en la fecha; devuelve copias y dinero al saldo', async t => {
  if (!conBase(t)) return;
  const { pub, entrada } = await publicar('tst4-1', 2, 10);
  assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub, 1])).ok, true);
  const pago = await rpc(ids.comprador, 'crear_pago', [tienda]);
  assert.equal((await rpc(ids.comprador, 'subir_comprobante', [pago.pago_id, 'https://x/v.jpg', 'ANU' + Date.now()])).ok, true);
  assert.equal((await rpc(ids.admin, 'revisar_pago', [pago.pago_id, 'confirmar', null])).ok, true);
  const o = (await q<{ id: string; subtotal: number }>(`select id, subtotal from public.ordenes where pago_id = $1`, [pago.pago_id]))[0];
  assert.equal((await q<{ c: number }>(`select cantidad as c from public.entradas where id = $1`, [entrada]))[0].c, 1, 'una copia salió de la colección al confirmar');
  const antes = await saldoDe(ids.comprador);
  const pronto = await rpc(ids.comprador, 'anular_orden_comprador', [o.id]);
  assert.equal(pronto.ok, false); assert.match(String(pronto.error), /48 h/);
  assert.equal((await rpc(ids.otro, 'anular_orden_comprador', [o.id])).ok, false, 'solo el comprador');
  await q(`update public.ordenes set pago_confirmado_en = now() - interval '49 hours' where id = $1`, [o.id]);
  const anu = await rpc(ids.comprador, 'anular_orden_comprador', [o.id]);
  assert.equal(anu.ok, true, JSON.stringify(anu));
  const od = (await q<{ estado: string; falta_vendedor: boolean; anulada_por: string; motivo: string }>(`select estado, falta_vendedor, anulada_por, motivo from public.ordenes where id = $1`, [o.id]))[0];
  assert.deepEqual([od.estado, od.falta_vendedor, od.anulada_por], ['vencida', true, 'comprador']); assert.match(od.motivo, /no eligió fecha/);
  assert.equal((await q<{ c: number }>(`select cantidad as c from public.entradas where id = $1`, [entrada]))[0].c, 2, 'la copia volvió a la colección del vendedor');
  assert.equal(await saldoDe(ids.comprador), Number((antes + o.subtotal).toFixed(2)));
  assert.match((await q<{ titulo: string }>(`select titulo from public.notificaciones where usuario_id = $1 and tipo = 'orden_vencida' order by id desc limit 1`, [ids.comprador]))[0].titulo, /te devolvimos/);
  assert.ok(Number((await q<{ r: { faltas: number } }>(`select reputacion as r from public.perfiles where id = $1`, [ids.vendedor]))[0].r.faltas) >= 1, 'cuenta como falta');
  // fecha elegida y no cumplida → también se puede anular
  const { pub: pub2 } = await publicar('tst4-2', 1, 4);
  assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub2, 1])).ok, true);
  const pago2 = await rpc(ids.comprador, 'crear_pago', [tienda, false]);   // sin usar el saldo
  assert.equal(pago2.monto_saldo, 0);
  assert.equal((await rpc(ids.comprador, 'subir_comprobante', [pago2.pago_id, 'https://x/v.jpg', 'ANU2' + Date.now()])).ok, true);
  assert.equal((await rpc(ids.admin, 'revisar_pago', [pago2.pago_id, 'confirmar', null])).ok, true);
  const o2 = (await q<{ id: string; fecha_limite: string }>(`select id, fecha_limite::text from public.ordenes where pago_id = $1`, [pago2.pago_id]))[0];
  assert.equal((await rpc(ids.vendedor, 'elegir_fecha_entrega', [o2.id, o2.fecha_limite])).ok, true);
  assert.equal((await rpc(ids.comprador, 'anular_orden_comprador', [o2.id])).ok, false, 'la fecha aún no pasó');
  await q(`update public.ordenes set fecha_entrega = (now() at time zone 'America/Lima')::date - 1 where id = $1`, [o2.id]);
  const anu2 = await rpc(ids.comprador, 'anular_orden_comprador', [o2.id]);
  assert.equal(anu2.ok, true); assert.match((await q<{ motivo: string }>(`select motivo from public.ordenes where id = $1`, [o2.id]))[0].motivo, /fecha prometida/);
});

test('saldo del comprador: se usa en la siguiente compra (si cubre todo, se confirma sola); se devuelve si el pago vence; se puede retirar', async t => {
  if (!conBase(t)) return;
  const saldo = await saldoDe(ids.comprador);
  assert.ok(saldo >= 14, 'hay saldo de las anulaciones anteriores: ' + saldo);
  // compra barata cubierta por el saldo → confirmada al instante, sin comprobante
  const { pub } = await publicar('tst4-1', 1, 6);
  assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub, 1])).ok, true);
  const pago = await rpc(ids.comprador, 'crear_pago', [tienda]);
  assert.deepEqual([pago.ok, pago.monto_saldo, pago.monto_yape, pago.confirmado], [true, 6, 0, true], JSON.stringify(pago));
  const pg = (await q<{ estado: string; n_operacion: string; monto_saldo: number }>(`select estado, n_operacion, monto_saldo from public.pagos where id = $1`, [pago.pago_id]))[0];
  assert.deepEqual([pg.estado, pg.n_operacion, pg.monto_saldo], ['confirmado', 'SALDO', 6]);
  assert.equal((await q<{ estado: string }>(`select estado from public.ordenes where pago_id = $1`, [pago.pago_id]))[0].estado, 'pago_confirmado');
  assert.equal(await saldoDe(ids.comprador), Number((saldo - 6).toFixed(2)));
  const mio = await como(ids.comprador, async c => (await c.query(`select public.mi_saldo_comprador() as s`)).rows[0].s) as { saldo: number; movimientos: { tipo: string; monto: number }[] };
  assert.equal(Number(mio.saldo), Number((saldo - 6).toFixed(2))); assert.equal(mio.movimientos[0].tipo, 'uso_compra'); assert.equal(Number(mio.movimientos[0].monto), -6);
  // compra cara: usa el saldo restante y el resto por Yape; si no llega el comprobante, el saldo vuelve
  const resto = await saldoDe(ids.comprador);
  const { pub: pub2 } = await publicar('tst4-2', 1, resto + 20);
  assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub2, 1])).ok, true);
  const pago2 = await rpc(ids.comprador, 'crear_pago', [tienda]);
  assert.deepEqual([pago2.ok, Number(pago2.monto_saldo), Number(pago2.monto_yape), pago2.confirmado ?? false], [true, resto, 20, false]);
  assert.equal(await saldoDe(ids.comprador), 0);
  await q(`update public.pagos set expira = now() - interval '1 minute' where id = $1`, [pago2.pago_id]);
  await q(`select public.vencer_pagos()`);
  assert.equal((await q<{ estado: string }>(`select estado from public.pagos where id = $1`, [pago2.pago_id]))[0].estado, 'vencido');
  assert.equal(await saldoDe(ids.comprador), resto, 'el saldo usado volvió');
  // retiro del saldo → entra como pago pendiente del Excel (sin datos de cobro queda "sin datos")
  await q(`delete from public.datos_cobro where usuario_id = $1`, [ids.comprador]);
  const ret = await rpc(ids.comprador, 'retirar_saldo', []);
  assert.deepEqual([ret.ok, Number(ret.monto), ret.sin_datos], [true, resto, true]);
  assert.equal(await saldoDe(ids.comprador), 0);
  const r = (await q<{ estado: string; origen: string; monto: number }>(`select estado, origen, monto from public.retiros where id = $1`, [ret.retiro_id]))[0];
  assert.deepEqual([r.estado, r.origen, r.monto], ['sin_datos', 'saldo', resto]);
  assert.equal((await rpc(ids.comprador, 'retirar_saldo', [])).ok, false, 'sin saldo no hay retiro');
  await q(`insert into public.datos_cobro (usuario_id, metodo, titular, cifrado) values ($1, 'yape', 'Camilo Cruz', 'x')`, [ids.comprador]);
  assert.equal((await q<{ n: number }>(`select public.activar_retiros_sin_datos($1) as n`, [ids.comprador]))[0].n, 1);
  assert.equal((await rpc(ids.admin, 'marcar_retiro_pagado', [ret.retiro_id, 'OP-S1', null])).ok, true);
  assert.match((await q<{ cuerpo: string }>(`select cuerpo from public.notificaciones where usuario_id = $1 and tipo = 'retiro_pagado' order by id desc limit 1`, [ids.comprador]))[0].cuerpo, /Devolución de tu saldo/);
  await q(`delete from public.datos_cobro where usuario_id = $1`, [ids.comprador]);
});

test('reclamos: solo en tienda, por el comprador o la tienda; el saldo del vendedor no se libera; el administrador resuelve (parcial, devolver, entregar)', async t => {
  if (!conBase(t)) return;
  async function ordenEnTienda(precio: number, recibe = ids.vendedor) {
    const { pub, entrada } = await publicar('tst4-1', 1, precio);
    assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub, 1])).ok, true);
    const pago = await rpc(ids.comprador, 'crear_pago', [tienda, false]);
    assert.equal((await rpc(ids.comprador, 'subir_comprobante', [pago.pago_id, 'https://x/v.jpg', 'REC' + Date.now() + Math.random()])).ok, true);
    assert.equal((await rpc(ids.admin, 'revisar_pago', [pago.pago_id, 'confirmar', null])).ok, true);
    const o = (await q<{ id: string; numero: number; subtotal: number; neto_vendedor: number; fecha_limite: string }>(`select id, numero, subtotal, neto_vendedor, fecha_limite::text from public.ordenes where pago_id = $1`, [pago.pago_id]))[0];
    assert.equal((await rpc(ids.comprador, 'abrir_reclamo', [o.id, 'estado', 'aún no', '{}'])).ok, false, 'antes de estar en tienda no hay reclamo');
    assert.equal((await rpc(recibe, 'marcar_en_tienda', [o.id, 'https://x/e.jpg'])).ok, true);
    return { ...o, entrada, pub };
  }
  // parcial: la carta tiene un defecto → S/ 5 vuelven al comprador y la orden se entrega
  const a = await ordenEnTienda(20);
  assert.equal((await rpc(ids.otro, 'abrir_reclamo', [a.id, 'estado', 'x', '{}'])).ok, false, 'un tercero no reclama');
  assert.equal((await rpc(ids.comprador, 'abrir_reclamo', [a.id, 'invalido', 'x', '{}'])).ok, false);
  const rec = await rpc(ids.comprador, 'abrir_reclamo', [a.id, 'estado', 'Tiene un doblez en la esquina', ['c/reclamo-1.jpg']]);
  assert.equal(rec.ok, true, JSON.stringify(rec));
  assert.equal((await q<{ estado: string }>(`select estado from public.ordenes where id = $1`, [a.id]))[0].estado, 'disputa');
  assert.equal((await rpc(ids.comprador, 'abrir_reclamo', [a.id, 'otro', 'otra vez', '{}'])).ok, false, 'un solo reclamo abierto por orden');
  assert.equal((await rpc(ids.comprador, 'marcar_entregada', [a.id, null, null])).ok, false, 'en disputa no se entrega');
  await q(`select public.liberar_saldos()`);
  assert.equal((await q<{ estado: string }>(`select estado from public.ordenes where id = $1`, [a.id]))[0].estado, 'disputa', 'el saldo del vendedor no se libera');
  assert.match((await q<{ titulo: string }>(`select titulo from public.notificaciones where usuario_id = $1 and tipo = 'reclamo' order by id desc limit 1`, [ids.admin]))[0].titulo, /estado distinto/);
  assert.match((await q<{ cuerpo: string }>(`select cuerpo from public.notificaciones where usuario_id = $1 and tipo = 'reclamo_vendedor' order by id desc limit 1`, [ids.vendedor]))[0].cuerpo, /doblez/);
  assert.equal((await rpc(ids.comprador, 'resolver_reclamo', [rec.reclamo_id, 'devolver', null, ''])).ok, false, 'solo el administrador resuelve');
  assert.equal((await rpc(ids.admin, 'resolver_reclamo', [rec.reclamo_id, 'parcial', 25, ''])).ok, false, 'parcial debe ser menor que el total');
  const saldo0 = await saldoDe(ids.comprador);
  const res = await rpc(ids.admin, 'resolver_reclamo', [rec.reclamo_id, 'parcial', 5, 'Descuento por el doblez']);
  assert.deepEqual([res.ok, Number(res.devuelto)], [true, 5], JSON.stringify(res));
  const oa = (await q<{ estado: string; neto_vendedor: number }>(`select estado, neto_vendedor from public.ordenes where id = $1`, [a.id]))[0];
  assert.equal(oa.estado, 'saldo_liberado'); assert.equal(oa.neto_vendedor, Number((a.neto_vendedor - 5).toFixed(2)));
  assert.equal(await saldoDe(ids.comprador), Number((saldo0 + 5).toFixed(2)));
  assert.equal((await q(`select 1 from public.entradas where usuario_id = $1 and compra_orden_id = $2`, [ids.comprador, a.id])).length, 1, 'el comprador se queda con la carta');
  const rr = (await q<{ estado: string; resolucion: string; monto_devuelto: number; nota_admin: string }>(`select estado, resolucion, monto_devuelto, nota_admin from public.reclamos where id = $1`, [rec.reclamo_id]))[0];
  assert.deepEqual([rr.estado, rr.resolucion, rr.monto_devuelto, rr.nota_admin], ['resuelto', 'parcial', 5, 'Descuento por el doblez']);
  // devolver: la tienda reclama por el comprador → la orden se anula, la copia vuelve al vendedor, el dinero al saldo, falta registrada
  await q(`update public.perfiles set rol = 'tienda', tienda_id = $2 where id = $1`, [ids.otro, tienda]);
  try {
    const b = await ordenEnTienda(12, ids.otro);
    const rec2 = await rpc(ids.otro, 'abrir_reclamo', [b.id, 'carta_distinta', 'El comprador dice que no es la carta', '{}']);
    assert.equal(rec2.ok, true, JSON.stringify(rec2));
    assert.equal((await q<{ p: string }>(`select abierto_por as p from public.reclamos where id = $1`, [rec2.reclamo_id]))[0].p, 'tienda');
    const s1 = await saldoDe(ids.comprador);
    const faltas0 = Number((await q<{ r: { faltas: number } }>(`select reputacion as r from public.perfiles where id = $1`, [ids.vendedor]))[0].r.faltas);
    const dev = await rpc(ids.admin, 'resolver_reclamo', [rec2.reclamo_id, 'devolver', null, 'Era otra carta']);
    assert.deepEqual([dev.ok, Number(dev.devuelto)], [true, 12]);
    const ob = (await q<{ estado: string; falta_vendedor: boolean; anulada_por: string }>(`select estado, falta_vendedor, anulada_por from public.ordenes where id = $1`, [b.id]))[0];
    assert.deepEqual([ob.estado, ob.falta_vendedor, ob.anulada_por], ['cancelada', true, 'reclamo']);
    assert.equal((await q<{ c: number }>(`select cantidad as c from public.entradas where id = $1`, [b.entrada]))[0].c, 1, 'la copia volvió a la colección del vendedor');
    assert.equal(await saldoDe(ids.comprador), Number((s1 + 12).toFixed(2)));
    assert.equal(Number((await q<{ r: { faltas: number } }>(`select reputacion as r from public.perfiles where id = $1`, [ids.vendedor]))[0].r.faltas), faltas0 + 1);
    assert.match((await q<{ titulo: string }>(`select titulo from public.notificaciones where usuario_id = $1 and tipo = 'reclamo_tienda' order by id desc limit 1`, [ids.otro]))[0].titulo, /entregar las cartas al vendedor/);
    // entregar: el administrador no da la razón → la orden se entrega sin devolución
    const c = await ordenEnTienda(9, ids.otro);
    const rec3 = await rpc(ids.comprador, 'abrir_reclamo', [c.id, 'otro', 'No me gusta', '{}']);
    const s2 = await saldoDe(ids.comprador);
    const ent = await rpc(ids.admin, 'resolver_reclamo', [rec3.reclamo_id, 'entregar', null, 'La carta es la publicada']);
    assert.deepEqual([ent.ok, Number(ent.devuelto)], [true, 0]);
    assert.equal((await q<{ estado: string }>(`select estado from public.ordenes where id = $1`, [c.id]))[0].estado, 'saldo_liberado');
    assert.equal(await saldoDe(ids.comprador), s2);
  } finally { await q(`update public.perfiles set rol = 'usuario', tienda_id = null where id = $1`, [ids.otro]); }
});

// ---------------------------------------------------------------------------------------------
// C · reportes del administrador
// ---------------------------------------------------------------------------------------------
test('reportes: ventas, comisiones y devoluciones del período por día/semana/mes; top vendedores y cartas; solo el administrador', async t => {
  if (!conBase(t)) return;
  await venderYEntregar('tst4-1', 1, 15, 1);   // al menos una venta entregada en el período
  // ... y una orden vencida (el vendedor no eligió fecha en 48 h → el comprador la anula)
  const { pub } = await publicar('tst4-2', 1, 7);
  assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub, 1])).ok, true);
  const pagoV = await rpc(ids.comprador, 'crear_pago', [tienda, false]);
  assert.equal((await rpc(ids.comprador, 'subir_comprobante', [pagoV.pago_id, 'https://x/v.jpg', 'REP' + Date.now()])).ok, true);
  assert.equal((await rpc(ids.admin, 'revisar_pago', [pagoV.pago_id, 'confirmar', null])).ok, true);
  const ordenV = (await q<{ id: string }>(`select id from public.ordenes where pago_id = $1`, [pagoV.pago_id]))[0];
  await q(`update public.ordenes set pago_confirmado_en = now() - interval '49 hours' where id = $1`, [ordenV.id]);
  assert.equal((await rpc(ids.comprador, 'anular_orden_comprador', [ordenV.id])).ok, true);
  await assert.rejects(como(ids.comprador, c => c.query(`select public.reporte_ventas(current_date - 30, current_date, 'dia')`)), /administrador/);
  const rep = await como(ids.admin, async c => (await c.query(`select public.reporte_ventas(current_date - 30, current_date, 'dia') as r`)).rows[0].r) as { serie: { ventas: number }[]; totales: Record<string, number>; vendedores: { username: string; ordenes: number }[]; cartas: { nombre: string }[]; estados: Record<string, number> };
  const esperado = (await q<{ n: number; v: number; c: number }>(`select count(*)::int as n, coalesce(sum(subtotal), 0) as v, coalesce(sum(comision), 0) as c from public.ordenes where vendedor_id = $1 and estado in ('entregada', 'saldo_liberado')`, [ids.vendedor]))[0];
  assert.ok(Number(rep.totales.ordenes) >= esperado.n);
  const vend = rep.vendedores.find(v => v.username === 'f4_vendedor');
  assert.ok(vend && Number(vend.ordenes) === Number(esperado.n), 'el vendedor aparece con sus órdenes entregadas: ' + JSON.stringify({ vend, esperado }));
  assert.ok(rep.cartas.some(c => /Snorlax|Munchlax/.test(c.nombre)));
  const devEsperadas = (await q<{ n: number }>(`select count(*)::int as n from public.ordenes where (estado = 'vencida' or (estado = 'cancelada' and anulada_por = 'reclamo')) and actualizada >= current_date - 30`))[0].n;
  assert.ok(devEsperadas >= 1 && Number(rep.totales.devoluciones) === devEsperadas, 'cuenta vencidas y anuladas por reclamo: ' + JSON.stringify({ rep: rep.totales.devoluciones, devEsperadas }));
  assert.ok(Number(rep.totales.monto_devuelto) >= 7, 'suma lo devuelto');
  assert.ok(Number(rep.estados.entregada ?? 0) + Number(rep.estados.saldo_liberado ?? 0) >= 1 && Number(rep.estados.vencida) >= 1, 'órdenes por estado: ' + JSON.stringify(rep.estados));
  const serieMes = await como(ids.admin, async c => (await c.query(`select public.reporte_ventas(current_date - 30, current_date, 'mes') as r`)).rows[0].r) as { grupo: string; serie: { periodo: string }[] };
  assert.equal(serieMes.grupo, 'mes'); assert.ok(serieMes.serie.every(f => /^\d{4}-\d{2}$/.test(f.periodo)));
  const ordenes = await como(ids.admin, async c => (await c.query(`select * from public.reporte_ordenes(current_date - 30, current_date)`)).rows) as { vendedor: string; cartas: string; tienda: string }[];
  assert.ok(ordenes.some(o => o.vendedor === 'f4_vendedor' && /Snorlax/.test(o.cartas) && o.tienda === 'Tienda F4'));
  assert.equal((await como(ids.comprador, async c => (await c.query(`select * from public.reporte_ordenes(current_date - 30, current_date)`)).rows)).length, 0, 'un usuario común no ve el detalle');
});

// ---------------------------------------------------------------------------------------------
// D · confianza pública: tiendas y ventas visibles sin cuenta, cifras, favoritos con aviso
// ---------------------------------------------------------------------------------------------
test('público: tiendas activas y ventas entregadas se ven sin cuenta (sin datos personales); cifras de la comunidad', async t => {
  if (!conBase(t)) return;
  await q(`update public.tiendas set tarifa_recojo = 2.5, instagram = '@tiendaf4', lat = -12.0862, lon = -77.0346 where id = $1`, [tienda]);
  const tiendas = await como(null, async c => (await c.query(`select nombre, distrito, tarifa_recojo, instagram, lat, lon from public.tiendas_publicas where id = $1`, [tienda])).rows);
  assert.deepEqual(tiendas, [{ nombre: 'Tienda F4', distrito: 'Lince', tarifa_recojo: 2.5, instagram: '@tiendaf4', lat: -12.0862, lon: -77.0346 }]);
  await q(`update public.tiendas set activa = false where id = $1`, [tienda]);
  assert.equal((await como(null, async c => (await c.query(`select 1 from public.tiendas_publicas where id = $1`, [tienda])).rows)).length, 0, 'una tienda inactiva no se publica');
  await q(`update public.tiendas set activa = true where id = $1`, [tienda]);
  // ventas entregadas: solo carta, precio, estado, idioma, fecha y vendedor (nunca el comprador)
  await venderYEntregar('tst4-1', 1, 21, 1);
  const ventas = await como(null, async c => (await c.query(`select * from public.ventas_publicas where carta_id = 'tst4-1' order by entregada_en desc limit 1`)).rows);
  assert.equal(ventas.length, 1);
  assert.equal(ventas[0].precio_pen, 21); assert.equal(ventas[0].vendedor, 'f4_vendedor');
  assert.ok(!('comprador' in ventas[0]) && !('comprador_id' in ventas[0]) && !('orden_id' in ventas[0]), 'sin datos del comprador');
  const est = await como(null, async c => (await c.query(`select public.estadisticas_publicas() as e`)).rows[0].e) as Record<string, number> & { ultimas_ventas: { carta_id: string }[]; mas_vendidas: { carta_id: string; unidades: number }[] };
  assert.ok(Number(est.usuarios) >= 4 && Number(est.vendidas) >= 1 && Number(est.tiendas) >= 1, JSON.stringify(est));
  assert.ok(est.ultimas_ventas.some(v => v.carta_id === 'tst4-1') && est.mas_vendidas.some(v => v.carta_id === 'tst4-1'));
});

test('favoritos: solo los propios; aviso (app + correo) a quien tiene la carta en su lista cuando se publica, una vez al día, nunca al propio vendedor', async t => {
  if (!conBase(t)) return;
  await q(`delete from public.notificaciones where tipo = 'favorito'`);
  await como(ids.comprador, c => c.query(`insert into public.favoritos (carta_id) values ('tst4-2')`));
  await como(ids.vendedor, c => c.query(`insert into public.favoritos (carta_id) values ('tst4-2')`));   // el vendedor también la quiere: no debe avisarse a sí mismo
  assert.equal((await como(ids.otro, async c => (await c.query(`select * from public.favoritos`)).rows)).length, 0, 'otro usuario no ve favoritos ajenos');
  assert.equal((await como(ids.comprador, async c => (await c.query(`select carta_id from public.favoritos`)).rows)).length, 1);
  await assert.rejects(como(ids.otro, c => c.query(`insert into public.favoritos (usuario_id, carta_id) values ($1, 'tst4-1')`, [ids.comprador])), /policy|permission|denied/i);
  const { pub } = await publicar('tst4-2', 1, 9);
  const avisos = await q<{ usuario_id: string; titulo: string; enlace: string; canales: string[] }>(`select usuario_id, titulo, enlace, canales from public.notificaciones where tipo = 'favorito' and datos->>'carta_id' = 'tst4-2'`);
  assert.equal(avisos.length, 1, 'un aviso al comprador y ninguno al vendedor: ' + JSON.stringify(avisos));
  assert.equal(avisos[0].usuario_id, ids.comprador); assert.match(avisos[0].titulo, /Munchlax.*en venta/); assert.equal(avisos[0].enlace, '/app/carta/tst4-2'); assert.deepEqual(avisos[0].canales, ['app', 'correo']);
  // segunda publicación el mismo día → sin aviso repetido; pausar y reactivar tampoco
  await publicar('tst4-2', 1, 8);
  await como(ids.vendedor, c => c.query(`update public.publicaciones set estado = 'pausada' where id = $1`, [pub]));
  await como(ids.vendedor, c => c.query(`update public.publicaciones set estado = 'activa' where id = $1`, [pub]));
  assert.equal((await q(`select 1 from public.notificaciones where tipo = 'favorito' and datos->>'carta_id' = 'tst4-2'`)).length, 1);
  // al día siguiente, una nueva publicación vuelve a avisar
  await q(`update public.notificaciones set creada = creada - interval '25 hours' where tipo = 'favorito'`);
  await publicar('tst4-2', 1, 7);
  assert.equal((await q(`select 1 from public.notificaciones where tipo = 'favorito' and datos->>'carta_id' = 'tst4-2'`)).length, 2);
  // quitar de la lista: no más avisos
  await como(ids.comprador, c => c.query(`delete from public.favoritos where carta_id = 'tst4-2'`));
  await q(`update public.notificaciones set creada = creada - interval '25 hours' where tipo = 'favorito'`);
  await publicar('tst4-2', 1, 6);
  assert.equal((await q(`select 1 from public.notificaciones where tipo = 'favorito' and datos->>'carta_id' = 'tst4-2'`)).length, 2);
  assert.ok(Number((await como(null, async c => (await c.query(`select public.estadisticas_publicas()->'mas_deseadas' as m`)).rows[0].m) as { carta_id: string; personas: number }[]).find(x => x.carta_id === 'tst4-2')?.personas) >= 1, 'las más deseadas cuentan a quien aún la tiene en favoritos');
});
