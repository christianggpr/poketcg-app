#!/usr/bin/env node
/**
 * Supabase de mentira para pruebas locales: Auth (registro, verificación, ingreso, sesión) y
 * REST (subconjunto de PostgREST) sobre un PostgreSQL local con las mismas políticas RLS de la
 * migración. También simula Resend (/emails), TCGdex (/tcgdex/...) y el tipo de cambio (/fx).
 *
 *   DATABASE_URL=postgresql://postgres:test@127.0.0.1:5432/poketcg_test node test/mock-supabase.mjs
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const PORT = parseInt(process.env.MOCK_PORT || '54321', 10);
const DB = process.env.DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5432/poketcg_test';
const ANON_KEY = process.env.MOCK_ANON_KEY || 'anon-de-prueba';
const SERVICE_KEY = process.env.MOCK_SERVICE_KEY || 'service-de-prueba';
const CORREOS = process.env.MOCK_CORREOS || '/tmp/mock-correos.jsonl';
// Como PostgREST: numeric e int8 llegan como números JSON, no como texto
pg.types.setTypeParser(1700, v => (v == null ? null : parseFloat(v)));
pg.types.setTypeParser(20, v => (v == null ? null : parseInt(v, 10)));
const pool = new pg.Pool({ connectionString: DB, max: 8 });

// FK conocidas para incrustar recursos (select=alias:tabla(cols))
const FK = { cartas: { colecciones_tcg: 'coleccion_id' } };
const PK = { perfiles: ['id'], colecciones_tcg: ['id'], cartas: ['id'], precios: ['carta_id'], ajustes_globales: ['clave'], cajas: ['id'], entradas: ['id'], albumes: ['id'], album_casillas: ['album_id', 'indice'], publicaciones: ['id'], tareas_programadas: ['id'] };

const b64url = s => Buffer.from(s).toString('base64url');
function jwt(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = { sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, exp, iat: exp - 3600, session_id: crypto.randomUUID() };
  return `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.${b64url('firma-de-prueba')}`;
}
function claims(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
}
function userJson(u) {
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at, phone: '', last_sign_in_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.raw_user_meta_data || {}, identities: [{ id: u.id, user_id: u.id, provider: 'email', identity_data: { email: u.email } }], created_at: u.created_at, updated_at: u.updated_at, is_anonymous: false };
}
async function session(u) {
  const refresh = crypto.randomBytes(16).toString('hex');
  await pool.query('insert into auth.mock_refresh (token, user_id) values ($1, $2)', [refresh, u.id]);
  return { access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refresh, user: userJson(u) };
}
const send = (res, code, body, headers = {}) => {
  const data = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(data);
};
const authError = (res, code, msg, extra = {}) => send(res, code, { code, msg, error: msg, error_description: msg, message: msg, ...extra });
const readBody = req => new Promise(resolve => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => { try { resolve(d ? JSON.parse(d) : null); } catch { resolve(null); } }); });

async function userById(id) { const r = await pool.query('select * from auth.users where id = $1', [id]); return r.rows[0] || null; }
async function userByEmail(email) { const r = await pool.query('select * from auth.users where lower(email) = lower($1)', [email]); return r.rows[0] || null; }

// ---------------------------------------------------------------- AUTH
async function auth(req, res, url, body) {
  const p = url.pathname.replace(/^\/auth\/v1/, '');
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.apikey || bearer;

  if (p === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = await userByEmail(body?.email || '');
      if (!u || u.encrypted_password !== body?.password) return authError(res, 400, 'Invalid login credentials', { error_code: 'invalid_credentials' });
      if (!u.email_confirmed_at) return authError(res, 400, 'Email not confirmed', { error_code: 'email_not_confirmed' });
      return send(res, 200, await session(u));
    }
    if (grant === 'refresh_token') {
      const r = await pool.query('select user_id from auth.mock_refresh where token = $1', [body?.refresh_token || '']);
      if (!r.rows[0]) return authError(res, 400, 'Invalid Refresh Token', { error_code: 'refresh_token_not_found' });
      return send(res, 200, await session(await userById(r.rows[0].user_id)));
    }
    return authError(res, 400, 'unsupported grant');
  }
  if (p === '/user' && req.method === 'GET') {
    const c = claims(bearer);
    const u = c && (await userById(c.sub));
    if (!u) return authError(res, 401, 'invalid claims: missing sub claim', { error_code: 'bad_jwt' });
    return send(res, 200, userJson(u));
  }
  if (p === '/user' && req.method === 'PUT') {
    const c = claims(bearer);
    const u = c && (await userById(c.sub));
    if (!u) return authError(res, 401, 'invalid claims', { error_code: 'bad_jwt' });
    if (body?.password) await pool.query('update auth.users set encrypted_password = $1, updated_at = now() where id = $2', [body.password, u.id]);
    if (body?.data) await pool.query('update auth.users set raw_user_meta_data = raw_user_meta_data || $1::jsonb where id = $2', [JSON.stringify(body.data), u.id]);
    return send(res, 200, userJson(await userById(u.id)));
  }
  if (p === '/logout' && req.method === 'POST') return send(res, 204, null);
  if (p === '/verify' && req.method === 'POST') {
    const r = await pool.query('delete from auth.mock_tokens where token = $1 returning user_id, type', [body?.token_hash || '']);
    if (!r.rows[0]) return authError(res, 403, 'Email link is invalid or has expired', { error_code: 'otp_expired' });
    await pool.query('update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = $1', [r.rows[0].user_id]);
    return send(res, 200, await session(await userById(r.rows[0].user_id)));
  }
  if (p === '/admin/generate_link' && req.method === 'POST') {
    if (apikey !== SERVICE_KEY) return authError(res, 401, 'User not allowed');
    const tipo = body?.type;
    let u = await userByEmail(body?.email || '');
    if (tipo === 'signup') {
      if (u && u.email_confirmed_at) return authError(res, 422, 'A user with this email address has already been registered', { error_code: 'email_exists' });
      if (u) await pool.query('update auth.users set encrypted_password = $1, raw_user_meta_data = $2 where id = $3', [body.password, JSON.stringify(body.data || {}), u.id]);
      else {
        try {
          const r = await pool.query('insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) returning *', [body.email.toLowerCase(), body.password || '', JSON.stringify(body.data || {})]);
          u = r.rows[0];
        } catch (e) { return authError(res, 500, 'Database error saving new user: ' + e.message, { error_code: 'unexpected_failure' }); }
      }
    } else if (!u) return authError(res, 404, 'User not found', { error_code: 'user_not_found' });
    const token = crypto.randomBytes(20).toString('hex');
    await pool.query('insert into auth.mock_tokens (token, user_id, type) values ($1, $2, $3)', [token, u.id, tipo]);
    const redirect = body.redirect_to || '';
    return send(res, 200, { ...userJson(u), action_link: `http://127.0.0.1:${PORT}/auth/v1/verify?token=${token}&type=${tipo}&redirect_to=${encodeURIComponent(redirect)}`, email_otp: '123456', hashed_token: token, redirect_to: redirect, verification_type: tipo });
  }
  return authError(res, 404, 'not found: ' + p);
}

// ---------------------------------------------------------------- REST (subconjunto de PostgREST)
const ident = s => { if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error('identificador inválido: ' + s); return '"' + s + '"'; };
// columna simple o ruta JSON (detalle->>fecha, detalle->fx->>usd_pen)
const columna = k => {
  const partes = k.split(/(->>|->)/);
  let sql = ident(partes[0]);
  for (let i = 1; i < partes.length; i += 2) { const clave = partes[i + 1]; if (!/^[a-zA-Z0-9_]+$/.test(clave)) throw new Error('ruta json inválida: ' + k); sql += `${partes[i]}'${clave}'`; }
  return sql;
};
function condicion(k, v, vals) {
  const push = x => { vals.push(x); return '$' + vals.length; };
  const m = /^(\w+)\.(.*)$/s.exec(v);
  if (!m) return null;
  const col = columna(k), op = m[1], val = m[2];
  if (op === 'eq') return `${col} = ${push(val)}`;
  if (op === 'neq') return `${col} <> ${push(val)}`;
  if (op === 'ilike') return `${col}::text ilike ${push(val.replace(/\*/g, '%'))}`;
  if (op === 'like') return `${col}::text like ${push(val.replace(/\*/g, '%'))}`;
  if (op === 'is') return `${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
  if (op === 'in') { const lista = val.replace(/^\(|\)$/g, '').split(',').map(x => x.trim().replace(/^"|"$/g, '')); return `${col} = any(${push(lista)})`; }
  if (op === 'gt') return `${col} > ${push(val)}`;
  if (op === 'gte') return `${col} >= ${push(val)}`;
  if (op === 'lt') return `${col} < ${push(val)}`;
  if (op === 'lte') return `${col} <= ${push(val)}`;
  throw new Error('operador no soportado: ' + op);
}
function parseFilters(params, tabla) {
  const where = []; const vals = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    if (k === 'or') {
      // or=(a.is.null,b.lt.2026-01-01)
      const partes = v.replace(/^\(|\)$/g, '').split(',');
      const conds = partes.map(p => { const i = p.indexOf('.'); return condicion(p.slice(0, i), p.slice(i + 1), vals); }).filter(Boolean);
      if (conds.length) where.push('(' + conds.join(' or ') + ')');
      continue;
    }
    const c = condicion(k, v, vals);
    if (c) where.push(c);
  }
  return { sql: where.length ? ' where ' + where.join(' and ') : '', vals };
}
function parseSelect(tabla, sel) {
  if (!sel || sel === '*') return '*';
  const cols = [];
  let resto = sel;
  while (resto.length) {
    resto = resto.replace(/^\s*,?\s*/, '');
    if (!resto) break;
    const emb = /^(?:(\w+):)?(\w+)\(([^)]*)\)/.exec(resto);
    if (emb) {
      const alias = emb[1] || emb[2], otra = emb[2], fk = FK[tabla]?.[otra];
      if (!fk) throw new Error(`incrustación no soportada: ${tabla} → ${otra}`);
      const campos = emb[3].split(',').map(x => x.trim()).filter(Boolean).map(c => `'${c}', o.${ident(c)}`).join(', ');
      cols.push(`(select json_build_object(${campos}) from ${ident(otra)} o where o.id = ${ident(tabla)}.${ident(fk)}) as ${ident(alias)}`);
      resto = resto.slice(emb[0].length);
    } else {
      const m = /^([\w*]+)/.exec(resto);
      cols.push(m[1] === '*' ? '*' : ident(m[1]));
      resto = resto.slice(m[0].length);
    }
  }
  return cols.join(', ');
}
async function rest(req, res, url, body) {
  if (url.pathname.startsWith('/rest/v1/rpc/')) return rpc(req, res, url, body);
  const tabla = url.pathname.replace(/^\/rest\/v1\//, '').split('/')[0];
  if (!/^[a-z_]+$/.test(tabla)) return send(res, 404, { message: 'tabla inválida' });
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const prefer = req.headers.prefer || '';
  const single = (req.headers.accept || '').includes('vnd.pgrst.object');
  let role = 'anon', sub = null;
  if (bearer === SERVICE_KEY) role = 'service_role';
  else if (bearer && bearer !== ANON_KEY) { const c = claims(bearer); if (c && c.sub) { role = 'authenticated'; sub = c.sub; } }
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query(`set local role ${role}`);
    await cliente.query(`select set_config('request.jwt.claim.role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [role, sub || '']);
    const t = ident(tabla);
    const f = parseFilters(url.searchParams, tabla);
    let rows = [], count = null, status = 200;
    if (req.method === 'GET' || req.method === 'HEAD') {
      const sel = parseSelect(tabla, url.searchParams.get('select'));
      let order = '';
      const o = url.searchParams.get('order');
      if (o) order = ' order by ' + o.split(',').map(x => { const [c, d, n] = x.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}${n === 'nullsfirst' ? ' nulls first' : n === 'nullslast' ? ' nulls last' : ''}`; }).join(', ');
      const limit = url.searchParams.get('limit') ? ' limit ' + parseInt(url.searchParams.get('limit'), 10) : '';
      const offset = url.searchParams.get('offset') ? ' offset ' + parseInt(url.searchParams.get('offset'), 10) : '';
      if (prefer.includes('count=exact')) count = parseInt((await cliente.query(`select count(*) as n from ${t}${f.sql}`, f.vals)).rows[0].n, 10);
      if (req.method === 'GET') rows = (await cliente.query(`select ${sel} from ${t}${f.sql}${order}${limit}${offset}`, f.vals)).rows;
    } else if (req.method === 'POST') {
      const filas = Array.isArray(body) ? body : [body];
      if (!filas.length) rows = [];
      else {
        const cols = [...new Set(filas.flatMap(r => Object.keys(r)))];
        const vals = []; const tuplas = [];
        for (const r of filas) tuplas.push('(' + cols.map(c => { if (!(c in r)) return 'default'; vals.push(r[c] !== null && typeof r[c] === 'object' && !Array.isArray(r[c]) ? JSON.stringify(r[c]) : r[c]); return '$' + vals.length; }).join(', ') + ')');
        let sql = `insert into ${t} (${cols.map(ident).join(', ')}) values ${tuplas.join(', ')}`;
        if (prefer.includes('resolution=merge-duplicates')) {
          const conflicto = (url.searchParams.get('on_conflict') || PK[tabla].join(',')).split(',').map(x => ident(x.trim()));
          sql += ` on conflict (${conflicto.join(', ')}) do update set ${cols.map(c => `${ident(c)} = excluded.${ident(c)}`).join(', ')}`;
        } else if (prefer.includes('resolution=ignore-duplicates')) sql += ' on conflict do nothing';
        sql += ' returning *';
        rows = (await cliente.query(sql, vals)).rows;
        status = 201;
      }
    } else if (req.method === 'PATCH') {
      const cols = Object.keys(body || {});
      const vals = [...f.vals];
      const sets = cols.map(c => { const v = body[c]; vals.push(v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v); return `${ident(c)} = $${vals.length}`; });
      rows = cols.length ? (await cliente.query(`update ${t} set ${sets.join(', ')}${f.sql} returning *`, vals)).rows : [];
    } else if (req.method === 'DELETE') {
      rows = (await cliente.query(`delete from ${t}${f.sql} returning *`, f.vals)).rows;
    }
    await cliente.query('commit');
    const headers = {};
    if (count != null) headers['Content-Range'] = `*/${count}`;
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'application/json', ...headers }); return res.end(); }
    if (prefer.includes('return=minimal') && req.method !== 'GET') return send(res, status === 201 ? 201 : 204, null, headers);
    if (single) {
      if (rows.length === 1) return send(res, status, rows[0], headers);
      return send(res, 406, { code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' });
    }
    return send(res, status, rows, headers);
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    const code = e.code === '42501' ? 401 : e.code === '23505' ? 409 : 400;
    return send(res, code, { code: e.code || 'ERR', message: e.message, details: e.detail || null, hint: e.hint || null });
  } finally {
    cliente.release();
  }
}

// llamadas a funciones: POST /rest/v1/rpc/<fn> con argumentos con nombre
async function rpc(req, res, url, body) {
  const fn = url.pathname.replace(/^\/rest\/v1\/rpc\//, '');
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return send(res, 404, { message: 'función inválida' });
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let role = 'anon', sub = null;
  if (bearer === SERVICE_KEY) role = 'service_role';
  else if (bearer && bearer !== ANON_KEY) { const c = claims(bearer); if (c && c.sub) { role = 'authenticated'; sub = c.sub; } }
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query(`set local role ${role}`);
    await cliente.query(`select set_config('request.jwt.claim.role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [role, sub || '']);
    const args = body && typeof body === 'object' ? body : {};
    const nombres = Object.keys(args); const vals = [];
    const lista = nombres.map(n => { if (!/^[a-z_][a-z0-9_]*$/.test(n)) throw new Error('argumento inválido'); const v = args[n]; vals.push(v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v); return `${n} => $${vals.length}`; }).join(', ');
    const meta = await cliente.query(`select p.proretset, t.typname from pg_proc p join pg_type t on t.oid = p.prorettype join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1`, [fn]);
    if (!meta.rows[0]) { await cliente.query('rollback'); return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` }); }
    const r = await cliente.query(`select * from ${fn}(${lista})`, vals);
    await cliente.query('commit');
    if (meta.rows[0].proretset) return send(res, 200, r.rows);
    const fila = r.rows[0] || {};
    const claves = Object.keys(fila);
    // función escalar: PostgREST devuelve el valor directamente
    return send(res, 200, claves.length === 1 && claves[0] === fn ? fila[fn] : fila);
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    return send(res, e.code === '42501' ? 401 : 400, { code: e.code || 'ERR', message: e.message, details: e.detail || null, hint: e.hint || null });
  } finally { cliente.release(); }
}

// ---------------------------------------------------------------- Storage simulado (fotos de publicaciones)
// Objetos en memoria: "bucket/ruta" → { bytes, tipo }. Regla como en producción: cada usuario solo
// escribe/borra dentro de su carpeta (<uid>/...); la lectura de fotos es pública.
const objetos = new Map();
const BUCKETS = new Set(['fotos-publicaciones']);
const leerBytes = req => new Promise(resolve => { const partes = []; req.on('data', c => partes.push(c)); req.on('end', () => resolve(Buffer.concat(partes))); });
async function storage(req, res, url) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const c = bearer && bearer !== ANON_KEY && bearer !== SERVICE_KEY ? claims(bearer) : null;
  const sub = bearer === SERVICE_KEY ? 'service' : c?.sub || null;
  const pub = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (pub && req.method === 'GET') {
    const o = objetos.get(`${pub[1]}/${decodeURIComponent(pub[2])}`);
    if (!o) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    res.writeHead(200, { 'Content-Type': o.tipo, 'Content-Length': o.bytes.length, 'Access-Control-Allow-Origin': '*' }); return res.end(o.bytes);
  }
  const m = /^\/storage\/v1\/object\/([^/]+)(?:\/(.+))?$/.exec(url.pathname);
  if (!m || !BUCKETS.has(m[1])) { await leerBytes(req); return send(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }); }
  const bucket = m[1], ruta = m[2] ? decodeURIComponent(m[2]) : '';
  const propia = r => sub === 'service' || (sub && r.split('/')[0] === sub);
  if (req.method === 'POST' || req.method === 'PUT') {
    const bytes = await leerBytes(req);
    if (!propia(ruta)) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    if (objetos.has(`${bucket}/${ruta}`) && req.headers['x-upsert'] !== 'true') return send(res, 409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    const tipo = (req.headers['content-type'] || '').startsWith('multipart/') ? 'image/jpeg' : req.headers['content-type'] || 'application/octet-stream';
    if (bytes.length > 3 * 1024 * 1024) return send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    objetos.set(`${bucket}/${ruta}`, { bytes, tipo });
    return send(res, 200, { Key: `${bucket}/${ruta}`, Id: crypto.randomUUID() });
  }
  if (req.method === 'DELETE') {
    const body = JSON.parse((await leerBytes(req)).toString('utf8') || '{}');
    const borrados = [];
    for (const r of body.prefixes || []) { const k = `${bucket}/${r}`; if (objetos.has(k) && propia(r)) { objetos.delete(k); borrados.push({ name: r, bucket_id: bucket }); } }
    return send(res, 200, borrados);
  }
  await leerBytes(req);
  return send(res, 405, { message: 'método no simulado en storage' });
}

// ---------------------------------------------------------------- servicios externos simulados
function tcgdex(res, url) {
  const id = url.pathname.split('/').pop();
  // precios inventados pero deterministas a partir del id
  const h = crypto.createHash('md5').update(id).digest();
  const base = ((h[0] << 8) + h[1]) / 65535 * 20 + 0.25;
  if (url.pathname.includes('/ja/')) return send(res, 200, { id, pricing: { cardmarket: { trend: Math.round(base * 100) / 100, 'trend-holo': Math.round(base * 3 * 100) / 100 } } });
  return send(res, 200, { id, pricing: { tcgplayer: { normal: { marketPrice: Math.round(base * 100) / 100 }, 'reverse-holofoil': { marketPrice: Math.round(base * 2.5 * 100) / 100 } } } });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); return res.end(); }
  if (url.pathname.startsWith('/storage/v1/')) { try { return await storage(req, res, url); } catch (e) { return send(res, 500, { message: e.message }); } }
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : null;
  try {
    if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url, body);
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url, body);
    if (url.pathname === '/emails' && req.method === 'POST') { fs.appendFileSync(CORREOS, JSON.stringify({ t: new Date().toISOString(), ...body }) + '\n'); return send(res, 200, { id: crypto.randomUUID() }); }
    if (url.pathname.startsWith('/tcgdex/')) return tcgdex(res, url);
    if (url.pathname === '/fx-eur') return send(res, 200, { base_code: 'EUR', rates: { USD: 1.1 } });
    if (url.pathname === '/fx') return send(res, 200, { base_code: 'USD', rates: { USD: 1, PEN: 3.7, EUR: 0.9 } });
    if (url.pathname.startsWith('/realtime/')) { res.writeHead(404); return res.end(); }
    if (url.pathname === '/__reset' && req.method === 'POST') {
      await pool.query('delete from public.publicaciones; delete from public.entradas; delete from public.album_casillas; delete from public.albumes; delete from public.cajas; delete from public.perfiles; delete from auth.mock_tokens; delete from auth.mock_refresh; delete from auth.users;');
      objetos.clear();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/__objetos') return send(res, 200, [...objetos.keys()]);
    if (url.pathname === '/__correos') { return send(res, 200, fs.existsSync(CORREOS) ? fs.readFileSync(CORREOS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []); }
    send(res, 404, { message: 'ruta no simulada: ' + url.pathname });
  } catch (e) {
    send(res, 500, { message: e.message });
  }
});
server.on('upgrade', (req, socket) => { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); });
server.listen(PORT, '127.0.0.1', () => console.log(`mock-supabase en http://127.0.0.1:${PORT} (db ${DB.replace(/:[^:@/]+@/, ':***@')})`));
