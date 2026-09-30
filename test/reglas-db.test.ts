/**
 * Reglas de negocio de la Fase 2 probadas directamente en la base (PostgreSQL local con las
 * migraciones reales y la emulación mínima de Supabase de test/db/supabase-stub.sql).
 *
 *   test/db/reiniciar.sh   → crea la base `poketcg_test`
 *   npm test               → si la base no responde, estas pruebas se omiten
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5432/poketcg_test';
pg.types.setTypeParser(1700, v => (v == null ? null : parseFloat(v)));
pg.types.setTypeParser(20, v => (v == null ? null : parseInt(v, 10)));

let pool: pg.Pool | null = null;
const ids = { u1: '11111111-1111-4111-8111-111111111111', u2: '22222222-2222-4222-8222-222222222222' };

async function q<T = Record<string, unknown>>(sql: string, vals: unknown[] = []): Promise<T[]> {
  const r = await pool!.query(sql, vals);
  return r.rows as T[];
}
/** Ejecuta `fn` como el usuario `uid` (rol authenticated, con RLS), dentro de una transacción. */
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

before(async () => {
  const p = new pg.Pool({ connectionString: DB, max: 4, connectionTimeoutMillis: 3000 });
  try { await p.query('select 1'); pool = p; } catch { await p.end().catch(() => {}); return; }
  // datos mínimos: dos usuarios, una colección, tres cartas, precios de mercado y tipo de cambio conocidos
  await q(`delete from public.entradas where usuario_id in ($1, $2)`, [ids.u1, ids.u2]);
  await q(`delete from auth.users where id in ($1, $2)`, [ids.u1, ids.u2]);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'prueba1@poketcg.pe', '{"username":"vendedor_1","nombres":"Ana","apellidos":"Pérez","telefono":"987654321","dni":"11111111","acepto_terminos":true}'), ($2, 'prueba2@poketcg.pe', '{"username":"comprador_2","nombres":"Beto","apellidos":"Ruiz","telefono":"987654322","dni":"22222222","acepto_terminos":true}')`, [ids.u1, ids.u2]);
  await q(`insert into public.colecciones_tcg (id, nombre, region, total_cartas, total_impreso, fecha) values ('tst1', 'Colección de prueba', 'int', 3, 3, '2024-01-01') on conflict (id) do update set nombre = excluded.nombre`);
  await q(`insert into public.cartas (id, coleccion_id, numero, nombre, rareza, sin_datos) values
    ('tst1-1', 'tst1', '1', 'Bidoof', 'Common', false),
    ('tst1-2', 'tst1', '2', 'Bidoof', 'Rare Holo', false),
    ('tst1-3', 'tst1', '3', 'Gardevoir ex', 'Double Rare', false)
    on conflict (id) do update set nombre = excluded.nombre, rareza = excluded.rareza`);
  await q(`insert into public.ajustes_globales (clave, valor, actualizado_en) values ('fx', '{"usd_pen":3.5,"eur_pen":4.0}', now()), ('pisos', '{"normal":1,"especial":2}', now()) on conflict (clave) do update set valor = excluded.valor`);
  // precios: 1 → US$ 0.11 (S/ 0.385 → piso 1), 2 → holofoil US$ 0.43 (S/ 1.505 → piso 2), 3 → US$ 20 (S/ 70 → foto obligatoria)
  await q(`insert into public.precios (carta_id, datos, actualizado_en) values
    ('tst1-1', '{"ok":true,"tp":{"normal":0.11},"cm":null,"missing":false}', now()),
    ('tst1-2', '{"ok":true,"tp":{"holofoil":0.43},"cm":null,"missing":false}', now()),
    ('tst1-3', '{"ok":true,"tp":{"holofoil":20},"cm":null,"missing":false}', now())
    on conflict (carta_id) do update set datos = excluded.datos, actualizado_en = excluded.actualizado_en`);
});
after(async () => { if (pool) { await q(`delete from auth.users where id in ($1, $2)`, [ids.u1, ids.u2]); await pool.end(); } });

const soloConBase = (t: { skip: (m?: string) => void }) => { if (!pool) { t.skip('sin PostgreSQL local (ejecuta test/db/reiniciar.sh)'); return false; } return true; };

test('precio por defecto en la base: máx(piso, mercado) según acabado y rareza', async t => {
  if (!soloConBase(t)) return;
  const [r] = await q<{ normal: number; holo: number; ex: number; brillante: boolean }>(`select public.precio_defecto_pen('tst1-1', 'Normal') as normal, public.precio_defecto_pen('tst1-2', 'Holo') as holo, public.precio_defecto_pen('tst1-3', '') as ex, public.es_brillante('tst1-3', '') as brillante`);
  assert.equal(r.normal, 1);        // S/ 0.385 → piso S/ 1
  assert.equal(r.holo, 2);          // S/ 1.505 → piso S/ 2
  assert.equal(r.ex, 70);           // S/ 70 > piso → mercado
  assert.equal(r.brillante, true);  // "ex" cuenta como especial
});

test('caja en venta: publica sola, sigue la cantidad y borra la publicación con la entrada', async t => {
  if (!soloConBase(t)) return;
  const caja = await como(ids.u1, async c => (await c.query(`insert into public.cajas (nombre, orden) values ('Caja prueba', 1) returning id`)).rows[0].id as string);
  const ent = await como(ids.u1, async c => (await c.query(`insert into public.entradas (carta_id, caja_id, cantidad, acabado, idioma) values ('tst1-1', $1, 3, 'Normal', 'ES') returning id`, [caja])).rows[0].id as string);
  assert.equal((await q(`select 1 from public.publicaciones where entrada_id = $1`, [ent])).length, 0, 'sin caja en venta no se publica nada');
  await como(ids.u1, c => c.query(`update public.cajas set en_venta = true where id = $1`, [caja]));
  let [p] = await q<{ cantidad: number; precio_pen: number; estado: string; tipo_precio: string }>(`select cantidad, precio_pen, estado, tipo_precio from public.publicaciones where entrada_id = $1`, [ent]);
  assert.deepEqual([p.cantidad, p.precio_pen, p.estado, p.tipo_precio], [3, 1, 'activa', 'defecto']);
  // otra carta entra a la caja en venta → se publica sola
  const ent2 = await como(ids.u1, async c => (await c.query(`insert into public.entradas (carta_id, caja_id, cantidad, acabado, idioma) values ('tst1-2', $1, 1, 'Holo', 'EN') returning id`, [caja])).rows[0].id as string);
  [p] = await q(`select cantidad, precio_pen, estado, tipo_precio from public.publicaciones where entrada_id = $1`, [ent2]);
  assert.deepEqual([p.cantidad, p.precio_pen, p.estado], [1, 2, 'activa']);
  // la cantidad de la entrada cambia → la publicación se ajusta
  await como(ids.u1, c => c.query(`update public.entradas set cantidad = 5 where id = $1`, [ent]));
  assert.equal((await q<{ cantidad: number }>(`select cantidad from public.publicaciones where entrada_id = $1`, [ent]))[0].cantidad, 5);
  // no se puede publicar más copias de las que hay
  await como(ids.u1, c => c.query(`update public.publicaciones set cantidad = 99 where entrada_id = $1`, [ent]));
  assert.equal((await q<{ cantidad: number }>(`select cantidad from public.publicaciones where entrada_id = $1`, [ent]))[0].cantidad, 5);
  // se borra la entrada → se borra la publicación
  await como(ids.u1, c => c.query(`delete from public.entradas where id = $1`, [ent2]));
  assert.equal((await q(`select 1 from public.publicaciones where entrada_id = $1`, [ent2])).length, 0);
  await como(ids.u1, async c => { await c.query(`delete from public.entradas where caja_id = $1`, [caja]); await c.query(`delete from public.cajas where id = $1`, [caja]); });
});

test('foto obligatoria por encima de S/ 50: sin foto queda pausada, con foto se activa', async t => {
  if (!soloConBase(t)) return;
  const caja = await como(ids.u1, async c => (await c.query(`insert into public.cajas (nombre, orden) values ('Caja fotos', 2) returning id`)).rows[0].id as string);
  const ent = await como(ids.u1, async c => (await c.query(`insert into public.entradas (carta_id, caja_id, cantidad, acabado, idioma) values ('tst1-3', $1, 1, '', 'EN') returning id`, [caja])).rows[0].id as string);
  // precio por defecto S/ 70 → pausada por foto
  const pub = await como(ids.u1, async c => (await c.query(`insert into public.publicaciones (entrada_id, cantidad, tipo_precio) values ($1, 1, 'defecto') returning id, estado, motivo_pausa, precio_pen, aviso`, [ent])).rows[0]);
  assert.deepEqual([pub.estado, pub.motivo_pausa, pub.precio_pen], ['pausada', 'foto', 70]);
  assert.match(String(pub.aviso), /foto/i);
  // con foto → activa
  await como(ids.u1, c => c.query(`update public.publicaciones set fotos = array['https://x/f.jpg'] where id = $1`, [pub.id]));
  let [p] = await q<{ estado: string; motivo_pausa: string | null }>(`select estado, motivo_pausa from public.publicaciones where id = $1`, [pub.id]);
  assert.deepEqual([p.estado, p.motivo_pausa], ['activa', null]);
  // precio manual bajo (S/ 20) no exige foto; manual S/ 80 sin foto → pausada otra vez
  await como(ids.u1, c => c.query(`update public.publicaciones set fotos = '{}', tipo_precio = 'manual', precio_pen = 20 where id = $1`, [pub.id]));
  [p] = await q(`select estado, motivo_pausa from public.publicaciones where id = $1`, [pub.id]);
  assert.equal(p.estado, 'activa');
  await como(ids.u1, c => c.query(`update public.publicaciones set precio_pen = 80 where id = $1`, [pub.id]));
  [p] = await q(`select estado, motivo_pausa from public.publicaciones where id = $1`, [pub.id]);
  assert.deepEqual([p.estado, p.motivo_pausa], ['pausada', 'foto']);
  // precio manual mínimo S/ 0.50
  await assert.rejects(como(ids.u1, c => c.query(`update public.publicaciones set precio_pen = 0.1 where id = $1`, [pub.id])), /0\.50|precio/i);
  // la tarea diaria: si el mercado sube por encima de S/ 50 una publicación por defecto sin foto, la pausa
  await como(ids.u1, c => c.query(`update public.publicaciones set tipo_precio = 'defecto', fotos = '{}' where id = $1`, [pub.id]));
  await q(`update public.precios set datos = '{"ok":true,"tp":{"holofoil":10},"cm":null,"missing":false}' where carta_id = 'tst1-3'`);   // S/ 35
  await q(`select public.recalcular_publicaciones()`);
  [p] = await q(`select estado, motivo_pausa, precio_pen from public.publicaciones where id = $1`, [pub.id]);
  assert.deepEqual([p.estado, (p as { precio_pen: number }).precio_pen], ['activa', 35]);
  await q(`update public.precios set datos = '{"ok":true,"tp":{"holofoil":20},"cm":null,"missing":false}' where carta_id = 'tst1-3'`);   // S/ 70
  const [res] = await q<{ recalcular_publicaciones: { recalculadas: number; pausadas_por_foto: number } }>(`select public.recalcular_publicaciones()`);
  assert.ok(res.recalcular_publicaciones.pausadas_por_foto >= 1);
  [p] = await q(`select estado, motivo_pausa, precio_pen from public.publicaciones where id = $1`, [pub.id]);
  assert.deepEqual([p.estado, p.motivo_pausa, (p as { precio_pen: number }).precio_pen], ['pausada', 'foto', 70]);
  await como(ids.u1, async c => { await c.query(`delete from public.entradas where caja_id = $1`, [caja]); await c.query(`delete from public.cajas where id = $1`, [caja]); });
});

test('el mercado público no expone datos personales y otro usuario no toca mis publicaciones', async t => {
  if (!soloConBase(t)) return;
  const caja = await como(ids.u1, async c => (await c.query(`insert into public.cajas (nombre, orden, en_venta) values ('Caja pública', 3, true) returning id`)).rows[0].id as string);
  const ent = await como(ids.u1, async c => (await c.query(`insert into public.entradas (carta_id, caja_id, cantidad, acabado, idioma) values ('tst1-1', $1, 2, 'Normal', 'ES') returning id`, [caja])).rows[0].id as string);
  const filas = await como(ids.u2, async c => (await c.query(`select * from public.mercado where carta_id = 'tst1-1'`)).rows);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].vendedor, 'vendedor_1');
  for (const k of ['dni', 'telefono', 'nombres', 'apellidos', 'email', 'usuario_id']) assert.ok(!(k in filas[0]), 'la vista mercado expone ' + k);
  const anon = await como(null, async c => (await c.query(`select vendedor, precio_pen from public.mercado where carta_id = 'tst1-1'`)).rows);
  assert.equal(anon.length, 1, 'un visitante sin sesión también ve el mercado');
  // otro usuario: no ve ni edita la publicación en la tabla
  const ajenas = await como(ids.u2, async c => (await c.query(`select count(*)::int as n from public.publicaciones where entrada_id = $1`, [ent])).rows[0].n);
  assert.equal(ajenas, 0);
  const tocadas = await como(ids.u2, async c => (await c.query(`update public.publicaciones set precio_pen = 999 where entrada_id = $1`, [ent])).rowCount);
  assert.equal(tocadas, 0);
  // pausada o retirada → desaparece del mercado
  await como(ids.u1, c => c.query(`update public.publicaciones set estado = 'retirada' where entrada_id = $1`, [ent]));
  assert.equal((await como(ids.u2, async c => (await c.query(`select 1 from public.mercado where carta_id = 'tst1-1'`)).rows)).length, 0);
  await como(ids.u1, async c => { await c.query(`delete from public.entradas where caja_id = $1`, [caja]); await c.query(`delete from public.cajas where id = $1`, [caja]); });
});
