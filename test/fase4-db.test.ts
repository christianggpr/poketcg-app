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
  const pago = await rpc(comprador, 'crear_pago', [tienda]);
  assert.equal(pago.ok, true, JSON.stringify(pago));
  assert.equal((await rpc(comprador, 'subir_comprobante', [pago.pago_id, 'https://x/v.jpg', 'OP' + Date.now() + Math.random()])).ok, true);
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
