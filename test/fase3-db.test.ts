/**
 * Fase 3 · reglas de negocio en la base: compra (pago por Yape), órdenes, stock, plazos y notificaciones.
 * Usa PostgreSQL local con las migraciones reales (test/db/reiniciar.sh); si no responde, se omite.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5432/poketcg_test';
pg.types.setTypeParser(1700, v => (v == null ? null : parseFloat(v)));
pg.types.setTypeParser(20, v => (v == null ? null : parseInt(v, 10)));
pg.types.setTypeParser(1082, v => v);   // date como texto AAAA-MM-DD
pg.types.setTypeParser(1182, v => v.replace(/^\{|\}$/g, '').split(',').filter(Boolean));   // date[]

let pool: pg.Pool | null = null;
const ids = { vendedor: '55555555-5555-4555-8555-555555555555', comprador: '66666666-6666-4666-8666-666666666666', otro: '77777777-7777-4777-8777-777777777777', admin: '88888888-8888-4888-8888-888888888888', tienda: '99999999-9999-4999-8999-999999999999' };
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
  const todos = Object.values(ids).filter(x => x !== ids.tienda);
  await q(`delete from public.entradas where usuario_id = any($1::uuid[])`, [todos]);
  await q(`delete from auth.users where id = any($1::uuid[])`, [todos]);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'f3-vendedor@poketcg.pe', '{"username":"f3_vendedor","nombres":"Vero","apellidos":"Vega","telefono":"911111111","dni":"31111111","acepto_terminos":true}'),
    ($2, 'f3-comprador@poketcg.pe', '{"username":"f3_comprador","nombres":"Carlos","apellidos":"Cruz","telefono":"922222222","dni":"32222222","acepto_terminos":true}'),
    ($3, 'f3-otro@poketcg.pe', '{"username":"f3_otro","nombres":"Omar","apellidos":"Ortiz","telefono":"933333333","dni":"33333333","acepto_terminos":true}'),
    ($4, 'f3-admin@poketcg.pe', '{"username":"f3_admin","nombres":"Ada","apellidos":"Admin","telefono":"944444444","dni":"34444444","acepto_terminos":true}')`, [ids.vendedor, ids.comprador, ids.otro, ids.admin]);
  await q(`update public.perfiles set rol = 'admin' where id = $1`, [ids.admin]);
  await q(`insert into public.colecciones_tcg (id, nombre, region, total_cartas, total_impreso, fecha, abreviatura) values ('tst2', 'Colección F3', 'int', 2, 2, '2024-01-01', 'TS2') on conflict (id) do nothing`);
  await q(`insert into public.cartas (id, coleccion_id, numero, nombre, rareza, sin_datos) values ('tst2-1', 'tst2', '1', 'Bidoof', 'Common', false), ('tst2-2', 'tst2', '2', 'Bibarel', 'Uncommon', false) on conflict (id) do nothing`);
  await q(`delete from public.tiendas where nombre = 'Tienda F3'`);
  tienda = (await q<{ id: string }>(`insert into public.tiendas (nombre, distrito, direccion, horario, dias_abierto) values ('Tienda F3', 'Miraflores', 'Av. Larco 123', 'L–S 10:00–20:00', '{1,2,3,4,5,6}') returning id`))[0].id;
});
after(async () => {
  if (!pool) return;
  const todos = Object.values(ids).filter(x => x !== ids.tienda);
  await q(`delete from auth.users where id = any($1::uuid[])`, [todos]);
  await q(`delete from public.tiendas where id = $1`, [tienda]);
  await q(`delete from public.precios where carta_id like 'tst2-%'`);
  await q(`delete from public.colecciones_tcg where id = 'tst2'`);
  await pool.end();
});
const conBase = (t: { skip: (m?: string) => void }) => { if (!pool) { t.skip('sin PostgreSQL local'); return false; } return true; };

/** Publica N copias de una carta a precio manual y devuelve el id de la publicación. */
async function publicar(carta: string, cantidad: number, precio: number, vendedor = ids.vendedor): Promise<{ pub: string; caja: string; entrada: string }> {
  const caja = await como(vendedor, async c => (await c.query(`insert into public.cajas (nombre, orden) values ('Caja F3', 1) returning id`)).rows[0].id as string);
  const entrada = await como(vendedor, async c => (await c.query(`insert into public.entradas (carta_id, caja_id, cantidad, acabado, idioma) values ($1, $2, $3, 'Normal', 'ES') returning id`, [carta, caja, cantidad])).rows[0].id as string);
  const pub = await como(vendedor, async c => (await c.query(`insert into public.publicaciones (entrada_id, cantidad, tipo_precio, precio_pen) values ($1, $2, 'manual', $3) returning id`, [entrada, cantidad, precio])).rows[0].id as string);
  return { pub, caja, entrada };
}

test('plazo de entrega: dom–jue → sábado de esa semana; vie–sáb → sábado de la siguiente', async t => {
  if (!conBase(t)) return;
  const f = async (iso: string) => (await q<{ d: string }>(`select public.fecha_limite_entrega($1::timestamptz)::text as d`, [iso]))[0].d;
  assert.equal(await f('2026-09-30T15:00:00-05:00'), '2026-10-03');   // miércoles
  assert.equal(await f('2026-09-27T09:00:00-05:00'), '2026-10-03');   // domingo
  assert.equal(await f('2026-10-01T23:30:00-05:00'), '2026-10-03');   // jueves noche (hora de Lima)
  assert.equal(await f('2026-10-02T10:00:00-05:00'), '2026-10-10');   // viernes
  assert.equal(await f('2026-10-03T10:00:00-05:00'), '2026-10-10');   // sábado
  assert.equal(await f('2026-10-03T01:00:00Z'), '2026-10-10');        // 01:00Z del sábado = viernes 20:00 en Lima → sábado siguiente
});

test('comprar: carrito → pago pendiente con una orden por vendedor; el stock sigue apartado', async t => {
  if (!conBase(t)) return;
  const { pub } = await publicar('tst2-1', 3, 20);
  const { pub: pub2 } = await publicar('tst2-2', 1, 12.5, ids.otro);
  const r1 = await rpc(ids.comprador, 'reservar_copia', [pub, 2]);
  const r2 = await rpc(ids.comprador, 'reservar_copia', [pub2, 1]);
  assert.ok(r1.ok && r2.ok);
  const sinTienda = await rpc(ids.comprador, 'crear_pago', ['00000000-0000-4000-8000-000000000000']);
  assert.equal(sinTienda.ok, false);
  const pago = await rpc(ids.comprador, 'crear_pago', [tienda]);
  assert.equal(pago.ok, true, JSON.stringify(pago));
  assert.deepEqual([pago.monto, pago.ordenes, pago.yape_numero], [52.5, 2, '949114582']);
  // carrito vacío, stock apartado, no se puede soltar la reserva desde el carrito
  assert.equal((await como(ids.comprador, async c => (await c.query(`select * from public.mi_carrito()`)).rows)).length, 0);
  assert.equal((await q<{ disponibles: number }>(`select disponibles from public.mercado where id = $1`, [pub]))[0].disponibles, 1);
  const lib = await rpc(ids.comprador, 'liberar_reserva', [r1.reserva_id]);
  assert.equal(lib.ok, false);
  // no se puede iniciar otra compra mientras esta espera el comprobante
  await rpc(ids.comprador, 'reservar_copia', [pub, 1]);
  assert.equal((await rpc(ids.comprador, 'crear_pago', [tienda])).ok, false);
  const ordenes = await q<{ estado: string; subtotal: number; comision: number; neto_vendedor: number; vendedor_id: string }>(`select estado, subtotal, comision, neto_vendedor, vendedor_id from public.ordenes where pago_id = $1 order by subtotal desc`, [pago.pago_id]);
  assert.deepEqual(ordenes.map(o => [o.estado, o.subtotal, o.comision, o.neto_vendedor]), [['reservada', 40, 2, 38], ['reservada', 12.5, 0.63, 11.87]]);
  assert.equal((await q(`select 1 from public.orden_items oi join public.ordenes o on o.id = oi.orden_id where o.pago_id = $1`, [pago.pago_id])).length, 2);
  // el comprador ve su pago y sus órdenes; el vendedor solo sus órdenes; otro usuario nada
  assert.equal((await como(ids.comprador, async c => (await c.query(`select 1 from public.pagos where id = $1`, [pago.pago_id])).rows)).length, 1);
  assert.equal((await como(ids.vendedor, async c => (await c.query(`select 1 from public.ordenes where pago_id = $1`, [pago.pago_id])).rows)).length, 1);
  assert.equal((await como(ids.vendedor, async c => (await c.query(`select 1 from public.pagos where id = $1`, [pago.pago_id])).rows)).length, 0);
  // cancelar antes del comprobante → todo vuelve al mercado
  const cancel = await rpc(ids.comprador, 'cancelar_pago', [pago.pago_id]);
  assert.equal(cancel.ok, true);
  assert.equal((await q<{ estado: string }>(`select estado from public.pagos where id = $1`, [pago.pago_id]))[0].estado, 'cancelado');
  assert.equal((await q<{ disponibles: number }>(`select disponibles from public.mercado where id = $1`, [pub]))[0].disponibles, 2);   // queda la reserva suelta de 1
  assert.equal((await rpc(ids.comprador, 'cancelar_pago', [pago.pago_id])).ok, false);
});

test('comprobante → revisión (aviso al administrador, operación repetida) → confirmar: copias vendidas, código y plazo', async t => {
  if (!conBase(t)) return;
  const { pub } = await publicar('tst2-1', 2, 30);
  await q(`update public.reservas set estado = 'liberada' where comprador_id = $1 and estado = 'activa'`, [ids.comprador]);
  await q(`update public.publicaciones set reservadas = 0 where usuario_id = $1`, [ids.vendedor]);
  assert.equal((await rpc(ids.comprador, 'reservar_copia', [pub, 2])).ok, true);
  const pago = await rpc(ids.comprador, 'crear_pago', [tienda]);
  assert.equal(pago.ok, true, JSON.stringify(pago));
  // el administrador no puede confirmar antes del comprobante; un usuario común nunca
  assert.equal((await rpc(ids.admin, 'revisar_pago', [pago.pago_id, 'confirmar', null])).ok, false);
  assert.equal((await rpc(ids.comprador, 'subir_comprobante', [pago.pago_id, 'x', '12'])).ok, false);   // operación demasiado corta
  const sub = await rpc(ids.comprador, 'subir_comprobante', [pago.pago_id, 'https://x/voucher.jpg', ' 0012345 ']);
  assert.deepEqual([sub.ok, sub.estado, sub.duplicado], [true, 'revision', false]);
  assert.equal((await q<{ n: string }>(`select n_operacion as n from public.pagos where id = $1`, [pago.pago_id]))[0].n, '0012345');
  const avisoAdmin = await q<{ datos: { duplicado: boolean }; canales: string[] }>(`select datos, canales from public.notificaciones where usuario_id = $1 and tipo = 'pago_revision' order by id desc limit 1`, [ids.admin]);
  assert.equal(avisoAdmin.length, 1); assert.equal(avisoAdmin[0].datos.duplicado, false); assert.ok(avisoAdmin[0].canales.includes('correo'));
  assert.equal((await rpc(ids.otro, 'revisar_pago', [pago.pago_id, 'confirmar', null])).ok, false);
  const conf = await rpc(ids.admin, 'revisar_pago', [pago.pago_id, 'confirmar', null]);
  assert.equal(conf.ok, true, JSON.stringify(conf));
  const o = (await q<{ estado: string; codigo_retiro: string; fecha_limite: string; pago_confirmado_en: string }>(`select estado, codigo_retiro, fecha_limite::text, pago_confirmado_en from public.ordenes where pago_id = $1`, [pago.pago_id]))[0];
  assert.equal(o.estado, 'pago_confirmado');
  assert.match(o.codigo_retiro, /^\d{6}$/);
  assert.equal(o.fecha_limite, (await q<{ d: string }>(`select public.fecha_limite_entrega(now())::text as d`))[0].d);
  const p = (await q<{ reservadas: number; vendidas: number; estado: string }>(`select reservadas, vendidas, estado from public.publicaciones where id = $1`, [pub]))[0];
  assert.deepEqual([p.reservadas, p.vendidas, p.estado], [0, 2, 'reservada']);   // todas vendidas → fuera del mercado
  assert.equal((await q(`select 1 from public.mercado where id = $1`, [pub])).length, 0);
  assert.equal((await q<{ estado: string }>(`select estado from public.reservas where orden_id is not null and comprador_id = $1 order by creada desc limit 1`, [ids.comprador]))[0].estado, 'comprada');
  const avisoVendedor = await q<{ cuerpo: string; canales: string[] }>(`select cuerpo, canales from public.notificaciones where usuario_id = $1 and tipo = 'venta_confirmada' order by id desc limit 1`, [ids.vendedor]);
  assert.equal(avisoVendedor.length, 1);
  assert.match(avisoVendedor[0].cuerpo, /Tienda F3/); assert.match(avisoVendedor[0].cuerpo, /Caja "Caja F3"/); assert.match(avisoVendedor[0].cuerpo, /Bidoof/);
  assert.ok(avisoVendedor[0].canales.includes('whatsapp'));
  assert.equal((await q(`select 1 from public.notificaciones where usuario_id = $1 and tipo = 'pago_confirmado'`, [ids.comprador])).length, 1);
  // el vendedor no puede retirar ni pausar una publicación con copias vendidas pendientes de entrega
  await assert.rejects(como(ids.vendedor, c => c.query(`update public.publicaciones set estado = 'retirada' where id = $1`, [pub])), /vendidas/);
  // otra compra con el mismo número de operación → aviso de repetido
  const { pub: pub2 } = await publicar('tst2-2', 1, 15);
  assert.equal((await rpc(ids.otro, 'reservar_copia', [pub2, 1])).ok, true);
  const pago2 = await rpc(ids.otro, 'crear_pago', [tienda]);
  const sub2 = await rpc(ids.otro, 'subir_comprobante', [pago2.pago_id, 'https://x/v2.jpg', '0012345']);
  assert.equal(sub2.duplicado, true);
  // rechazar → el stock vuelve y el comprador recibe el motivo
  const rech = await rpc(ids.admin, 'revisar_pago', [pago2.pago_id, 'rechazar', 'El voucher no coincide']);
  assert.equal(rech.ok, true);
  assert.equal((await q<{ estado: string }>(`select estado from public.ordenes where pago_id = $1`, [pago2.pago_id]))[0].estado, 'pago_rechazado');
  assert.equal((await q<{ disponibles: number }>(`select disponibles from public.mercado where id = $1`, [pub2]))[0].disponibles, 1);
  assert.match((await q<{ cuerpo: string }>(`select cuerpo from public.notificaciones where usuario_id = $1 and tipo = 'pago_rechazado' order by id desc limit 1`, [ids.otro]))[0].cuerpo, /no coincide/);
});

test('sin comprobante a tiempo: la compra vence y las copias vuelven al mercado', async t => {
  if (!conBase(t)) return;
  const { pub } = await publicar('tst2-1', 1, 9);
  assert.equal((await rpc(ids.otro, 'reservar_copia', [pub, 1])).ok, true);
  const pago = await rpc(ids.otro, 'crear_pago', [tienda]);
  assert.equal(pago.ok, true, JSON.stringify(pago));
  assert.equal((await q(`select 1 from public.mercado where id = $1`, [pub])).length, 0);
  await q(`update public.pagos set expira = now() - interval '1 minute' where id = $1`, [pago.pago_id]);
  const tarde = await rpc(ids.otro, 'subir_comprobante', [pago.pago_id, 'https://x/v.jpg', '99999']);
  assert.equal(tarde.ok, false); assert.match(String(tarde.error), /venció/);
  assert.equal((await q<{ estado: string }>(`select estado from public.pagos where id = $1`, [pago.pago_id]))[0].estado, 'vencido');
  assert.equal((await q<{ disponibles: number }>(`select disponibles from public.mercado where id = $1`, [pub]))[0].disponibles, 1);
  // la función periódica hace lo mismo con las que nadie volvió a abrir
  assert.equal((await rpc(ids.otro, 'reservar_copia', [pub, 1])).ok, true);
  const pago2 = await rpc(ids.otro, 'crear_pago', [tienda]);
  await q(`update public.pagos set expira = now() - interval '1 minute' where id = $1`, [pago2.pago_id]);
  const v = (await q<{ r: { vencidos: number } }>(`select public.vencer_pagos() as r`))[0].r;
  assert.ok(v.vencidos >= 1);
  assert.equal((await q<{ estado: string }>(`select estado from public.ordenes where pago_id = $1`, [pago2.pago_id]))[0].estado, 'cancelada');
  assert.equal((await q<{ disponibles: number }>(`select disponibles from public.mercado where id = $1`, [pub]))[0].disponibles, 1);
});

/** Compra completa hasta pago confirmado: devuelve la orden. */
async function comprarYConfirmar(carta: string, copias: number, precio: number, cantidad: number, comprador = ids.comprador) {
  const { pub, entrada } = await publicar(carta, copias, precio);
  assert.equal((await rpc(comprador, 'reservar_copia', [pub, cantidad])).ok, true);
  const pago = await rpc(comprador, 'crear_pago', [tienda]);
  assert.equal(pago.ok, true, JSON.stringify(pago));
  assert.equal((await rpc(comprador, 'subir_comprobante', [pago.pago_id, 'https://x/v.jpg', 'OP' + Date.now()])).ok, true);
  assert.equal((await rpc(ids.admin, 'revisar_pago', [pago.pago_id, 'confirmar', null])).ok, true);
  const orden = (await q<{ id: string; codigo_retiro: string; fecha_limite: string; pago_id: string }>(`select id, codigo_retiro, fecha_limite::text, pago_id from public.ordenes where pago_id = $1`, [pago.pago_id]))[0];
  return { pub, entrada, orden, pagoId: pago.pago_id as string };
}

test('vendedor: fecha de entrega dentro del plazo y en día que abre la tienda; recibido en tienda con foto si la sede no tiene cuenta', async t => {
  if (!conBase(t)) return;
  const { orden } = await comprarYConfirmar('tst2-1', 3, 20, 2);
  const fechas = (await como(ids.vendedor, async c => (await c.query(`select public.fechas_entrega_posibles($1) as f`, [orden.id])).rows[0].f)) as string[];
  assert.ok(fechas.length >= 1 && fechas[fechas.length - 1] === orden.fecha_limite, JSON.stringify(fechas));
  assert.ok(fechas.every(f => new Date(f + 'T12:00:00Z').getUTCDay() !== 0), 'la tienda no abre los domingos');
  const mal = await rpc(ids.vendedor, 'elegir_fecha_entrega', [orden.id, '2030-01-01']);
  assert.equal(mal.ok, false);
  const ok = await rpc(ids.vendedor, 'elegir_fecha_entrega', [orden.id, orden.fecha_limite]);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal((await q(`select 1 from public.notificaciones where usuario_id = $1 and tipo = 'fecha_entrega'`, [ids.comprador])).length, 1);
  // el comprador no puede marcar "recibido"; el vendedor sí (la sede no tiene cuenta) pero con foto
  assert.equal((await rpc(ids.comprador, 'marcar_en_tienda', [orden.id, null])).ok, false);
  assert.equal((await rpc(ids.vendedor, 'marcar_en_tienda', [orden.id, null])).ok, false);
  const rec = await rpc(ids.vendedor, 'marcar_en_tienda', [orden.id, 'https://x/entrega.jpg']);
  assert.deepEqual([rec.ok, rec.estado, rec.por], [true, 'en_tienda', 'vendedor']);
  const aviso = (await q<{ cuerpo: string; canales: string[] }>(`select cuerpo, canales from public.notificaciones where usuario_id = $1 and tipo = 'en_tienda' order by id desc limit 1`, [ids.comprador]))[0];
  assert.match(aviso.cuerpo, new RegExp(orden.codigo_retiro)); assert.ok(aviso.canales.includes('whatsapp'));
  // el comprador confirma "Entregado": stock y colección del vendedor descontados (quedaba 1 copia)
  const ent = await rpc(ids.comprador, 'marcar_entregada', [orden.id, null, null]);
  assert.deepEqual([ent.ok, ent.por], [true, 'comprador']);
  const p = (await q<{ cantidad: number; vendidas: number; estado: string }>(`select cantidad, vendidas, estado from public.publicaciones where id = (select publicacion_id from public.orden_items where orden_id = $1)`, [orden.id]))[0];
  assert.deepEqual([p.cantidad, p.vendidas, p.estado], [1, 0, 'activa']);
  assert.equal((await q<{ cantidad: number }>(`select cantidad from public.entradas where id = (select entrada_id from public.orden_items where orden_id = $1)`, [orden.id]))[0].cantidad, 1);
  assert.match((await q<{ cuerpo: string }>(`select cuerpo from public.notificaciones where usuario_id = $1 and tipo = 'entregada' order by id desc limit 1`, [ids.vendedor]))[0].cuerpo, /38\.00/);
});

test('tienda con cuenta: "recibido" lo marca la sede y "retirado" exige el código; la última copia deja la publicación vendida', async t => {
  if (!conBase(t)) return;
  await q(`update public.perfiles set rol = 'tienda', tienda_id = $2 where id = $1`, [ids.otro, tienda]);
  try {
    const { orden, entrada, pub } = await comprarYConfirmar('tst2-2', 1, 12.5, 1);
    assert.equal((await rpc(ids.vendedor, 'marcar_en_tienda', [orden.id, 'https://x/f.jpg'])).ok, false, 'si la sede tiene cuenta, el vendedor no marca');
    const rec = await rpc(ids.otro, 'marcar_en_tienda', [orden.id, 'https://x/mostrador.jpg']);
    assert.deepEqual([rec.ok, rec.por], [true, 'tienda']);
    assert.equal((await rpc(ids.otro, 'marcar_entregada', [orden.id, '000000', null])).ok, false);
    const ok = await rpc(ids.otro, 'marcar_entregada', [orden.id, orden.codigo_retiro, null]);
    assert.deepEqual([ok.ok, ok.por], [true, 'tienda']);
    assert.deepEqual((ok.publicaciones_vendidas as string[]), [pub]);
    assert.equal((await q(`select 1 from public.entradas where id = $1`, [entrada])).length, 0, 'la entrada se borra al vender la última copia');
    const p = (await q<{ estado: string; entrada_id: string | null; vendidas: number }>(`select estado, entrada_id, vendidas from public.publicaciones where id = $1`, [pub]))[0];
    assert.deepEqual([p.estado, p.entrada_id, p.vendidas], ['vendida', null, 0]);
    // la cuenta de tienda ve la orden de su sede pero no datos personales
    const vista = await como(ids.otro, async c => (await c.query(`select o.estado, o.codigo_retiro from public.ordenes o where o.id = $1`, [orden.id])).rows);
    assert.equal(vista.length, 1);
    assert.equal((await como(ids.otro, async c => (await c.query(`select 1 from public.pagos where comprador_id <> $1`, [ids.otro])).rows)).length, 0, 'la tienda no ve pagos ajenos');
  } finally { await q(`update public.perfiles set rol = 'usuario', tienda_id = null where id = $1`, [ids.otro]); }
});

test('tarea diaria: recordatorios, confirmación automática a los N días y órdenes vencidas devuelven el stock', async t => {
  if (!conBase(t)) return;
  const a = await comprarYConfirmar('tst2-1', 2, 8, 1);
  await rpc(ids.vendedor, 'marcar_en_tienda', [a.orden.id, 'https://x/a.jpg']);
  await q(`update public.ordenes set en_tienda_en = now() - interval '26 hours' where id = $1`, [a.orden.id]);
  let m = (await q<{ r: Record<string, number> }>(`select public.mantenimiento_ordenes() as r`))[0].r;
  assert.ok(m.recordatorios >= 1);
  assert.equal((await q<{ recordatorios: number; estado: string }>(`select recordatorios, estado from public.ordenes where id = $1`, [a.orden.id]))[0].recordatorios, 1);
  await q(`update public.ordenes set en_tienda_en = now() - interval '4 days' where id = $1`, [a.orden.id]);
  m = (await q<{ r: Record<string, number> }>(`select public.mantenimiento_ordenes() as r`))[0].r;
  assert.ok(m.confirmadas_auto >= 1);
  assert.deepEqual((await q<{ estado: string; entregada_por: string }>(`select estado, entregada_por from public.ordenes where id = $1`, [a.orden.id]))[0], { estado: 'entregada', entregada_por: 'automatica' });
  // vencida: pasó el sábado límite sin entrega → la copia vuelve al vendedor y se avisa al administrador
  const b = await comprarYConfirmar('tst2-1', 2, 8, 1);
  await q(`update public.ordenes set fecha_limite = (now() at time zone 'America/Lima')::date - 1 where id = $1`, [b.orden.id]);
  m = (await q<{ r: Record<string, number> }>(`select public.mantenimiento_ordenes() as r`))[0].r;
  assert.ok(m.vencidas >= 1);
  assert.equal((await q<{ estado: string }>(`select estado from public.ordenes where id = $1`, [b.orden.id]))[0].estado, 'vencida');
  assert.equal((await q<{ vendidas: number }>(`select vendidas from public.publicaciones where id = $1`, [b.pub]))[0].vendidas, 0);
  assert.equal((await q<{ disponibles: number }>(`select disponibles from public.mercado where id = $1`, [b.pub]))[0].disponibles, 2);
  assert.match((await q<{ titulo: string }>(`select titulo from public.notificaciones where usuario_id = $1 and tipo = 'orden_vencida' order by id desc limit 1`, [ids.admin]))[0].titulo, /devolver/);
});
