#!/usr/bin/env node
/**
 * Prueba de extremo a extremo con Playwright contra la app en http://127.0.0.1:3000 y
 * test/mock-supabase.mjs en http://127.0.0.1:54321 (ver test/env-prueba.sh).
 *
 *   node test/e2e.mjs            (requiere: mock en marcha, `next build` + `next start -p 3000`)
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const require = createRequire(process.env.PLAYWRIGHT_MODULES || '/opt/node-tools/node_modules/');
const { chromium } = require('playwright');

const APP = 'http://127.0.0.1:3000';
const MOCK = 'http://127.0.0.1:54321';
const CAPTURAS = '/tmp/e2e';
fs.mkdirSync(CAPTURAS, { recursive: true });
let paso = 0;
const log = (...a) => console.log(`[${++paso}]`, ...a);
async function foto(page, nombre) { await page.screenshot({ path: path.join(CAPTURAS, `${String(paso).padStart(2, '0')}-${nombre}.png`), fullPage: false }); }
const sql = q => { fs.writeFileSync('/tmp/e2e-consulta.sql', q); return execSync('su postgres -c "psql -At -q -d poketcg_test -f /tmp/e2e-consulta.sql"').toString().trim(); };
const correos = async () => (await fetch(MOCK + '/__correos')).json();
const cabecerasCron = { Authorization: 'Bearer secreto-de-prueba-123' };
/** Ejecuta la tarea diaria completa (tipo de cambio, precios, publicaciones, mercado, mazos). */
const correrTarea = async () => {
  let r = await (await fetch(APP + '/api/tareas/tick?forzar=1', { headers: cabecerasCron })).json();
  for (let i = 0; i < 6 && r.pendiente; i++) r = await (await fetch(APP + '/api/tareas/tick', { headers: cabecerasCron })).json();
  return r;
};
const num = q => parseInt(sql(q), 10);
/** PNG mínimo (w×h, un color) para simular la foto de una carta. */
function png(w, h, rgb) {
  const fila = w * 3 + 1, raw = Buffer.alloc(fila * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * fila + 1 + x * 3);
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return (~c) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE', acceptDownloads: true });
const page = await ctx.newPage();
const erroresConsola = [];
page.on('console', m => { if (m.type() === 'error' && !/realtime|websocket|WebSocket|favicon|net::ERR/i.test(m.text())) erroresConsola.push(m.text()); });
page.on('pageerror', e => erroresConsola.push('pageerror: ' + e.message));

try {
  await fetch(MOCK + '/__reset', { method: 'POST' });
  try { fs.unlinkSync('/tmp/mock-correos.jsonl'); } catch { /* no existe */ }

  // ---------- registro
  log('registro');
  await page.goto(APP + '/registro');
  await page.fill('input[autocomplete=given-name]', 'Christian');
  await page.fill('input[autocomplete=family-name]', 'Gonzales');
  await page.fill('input[type=email]', 'christian@correo.pe');
  await page.fill('input[autocomplete=tel-national]', '987654321');
  await page.fill('input[maxlength="8"]', '12345678');
  await page.fill('input[autocomplete=username]', 'chris_tcg');
  await page.fill('input[type=password]', 'clave12345');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/verificar/, { timeout: 20000 });
  await foto(page, 'verificar');
  const c1 = await correos();
  if (c1.length !== 1 || !/Confirma tu correo/.test(c1[0].subject)) throw new Error('no llegó el correo de verificación: ' + JSON.stringify(c1));
  const enlace = /href="([^"]+\/auth\/confirmar[^"]+)"/.exec(c1[0].html)?.[1]?.replace(/&amp;/g, '&');
  if (!enlace) throw new Error('el correo no tiene enlace');
  log('correo de verificación recibido:', enlace.slice(0, 70) + '…');

  // registro repetido: usuario y correo ocupados
  await page.goto(APP + '/registro');
  await page.fill('input[autocomplete=given-name]', 'Otro'); await page.fill('input[autocomplete=family-name]', 'Usuario');
  await page.fill('input[type=email]', 'CHRISTIAN@correo.pe'); await page.fill('input[autocomplete=tel-national]', '987654322');
  await page.fill('input[maxlength="8"]', '12345678'); await page.fill('input[autocomplete=username]', 'CHRIS_TCG'); await page.fill('input[type=password]', 'clave12345'); await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.field .err');
  const errs = await page.$$eval('.field .err', els => els.map(e => e.textContent));
  if (!errs.some(e => /usuario ya/.test(e)) || !errs.some(e => /correo ya/.test(e)) || !errs.some(e => /DNI ya/.test(e))) throw new Error('duplicados no detectados: ' + errs.join(' | '));
  log('duplicados detectados:', errs.length);

  // ingresar sin verificar → aviso y reenvío
  await page.goto(APP + '/ingresar');
  await page.fill('input[autocomplete=username]', 'chris_tcg');
  await page.fill('input[type=password]', 'clave12345');
  await page.click('button[type=submit]');
  await page.waitForSelector('.notice.warn');
  await page.click('text=Reenviar correo de verificación');
  await page.waitForSelector('text=te enviamos un nuevo enlace');
  if ((await correos()).length !== 2) throw new Error('no se reenvió el correo');
  log('ingreso sin verificar avisa y reenvía');

  // confirmar por el enlace del correo → sesión iniciada
  await page.goto(enlace);
  await page.waitForURL(/\/app/, { timeout: 20000 });
  await page.waitForSelector('text=Tu colección está vacía', { timeout: 60000 });
  await foto(page, 'app-vacia');
  if (!(await page.textContent('body')).includes('Bienvenido')) throw new Error('sin mensaje de bienvenida');
  log('correo confirmado, sesión iniciada, catálogo cargado');

  // ---------- administrador: cargar catálogo
  sql("update public.perfiles set rol='admin' where username='chris_tcg'");
  await page.goto(APP + '/admin');
  await page.waitForSelector('text=usuarios registrados');
  if (parseInt(sql('select count(*) from public.cartas'), 10) < 34000 || process.env.E2E_CATALOGO === '1') {
    await page.click('text=Cargar catálogo en la base de datos');
    await page.waitForSelector('text=/Catálogo .* cargado/', { timeout: 300000 });
  }
  await foto(page, 'admin');
  const nCartas = parseInt(sql('select count(*) from public.cartas'), 10);
  if (nCartas < 34000) throw new Error('catálogo incompleto: ' + nCartas);
  log('catálogo cargado en la base:', nCartas, 'cartas');
  // tarea diaria: deja el tipo de cambio del mock (US$1 = S/ 3.70) para que los precios sean deterministas
  const t1 = await correrTarea();
  if (t1.tarea?.estado !== 'ok' || t1.tarea?.detalle?.fx?.usd_pen !== 3.7) throw new Error('la tarea diaria no fijó el tipo de cambio: ' + JSON.stringify(t1).slice(0, 300));
  log('tarea diaria ejecutada: tipo de cambio US$1 = S/ 3.70');

  // ---------- cajas
  await page.goto(APP + '/app/cajas');
  await page.click('text=+ Nueva caja');
  await page.fill('.sheet input.input', 'Caja 1');
  await page.click('.sheet-foot >> text=Crear caja');
  // Fase 2: al crear la caja se pregunta si se sube a la nube para vender
  await page.waitForSelector('[data-testid=pregunta-venta]');
  await page.click('[data-testid=pregunta-venta] button:has-text("Elegir cuáles")');
  await page.waitForSelector('.box-card >> text=Caja 1');
  await page.click('text=+ Nueva caja');
  await page.fill('.sheet input.input', 'Caja 2');
  await page.click('.sheet-foot >> text=Crear caja');
  await page.waitForSelector('[data-testid=pregunta-venta]');
  await page.click('[data-testid=pregunta-venta] button:has-text("Elegir cuáles")');
  await page.waitForSelector('.box-card >> text=Caja 2');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await foto(page, 'cajas');
  if (sql("select count(*) from public.cajas where en_venta") !== '0') throw new Error('las cajas no debían quedar en venta');
  log('dos cajas creadas (pregunta de venta respondida: elegir cuáles)');

  // ---------- guardar cartas desde Buscar
  async function guardar(q, idCarta, esperado) {
    await page.goto(APP + '/app');
    await page.fill('.search-wrap input', q);
    await page.waitForSelector('.card-row');
    const fila = page.locator('.card-row', { hasText: idCarta.texto }).first();
    await fila.locator('text=+ Guardar en una caja').click();
    await page.waitForSelector('.sheet');
    if (idCarta.caja) await page.click(`.sheet .chipbtn:has-text("${idCarta.caja}")`);
    if (idCarta.acabado) await page.selectOption('.sheet select >> nth=0', idCarta.acabado);
    await page.click('.sheet-foot >> text=Guardar');
    await page.waitForSelector('.placement .where');
    const donde = await page.textContent('.placement .where');
    if (!donde.includes(esperado)) throw new Error(`ubicación inesperada para ${q}: "${donde}" (esperaba "${esperado}")`);
    const titulo = await page.textContent('.sheet-head h3');
    await foto(page, 'guardada');
    await page.click('.sheet-foot >> text=Listo');
    return { donde, titulo };
  }
  let r = await guardar('pikachu 151', { texto: '025/165', caja: 'Caja 1' }, 'Caja 1 · posición 1 de 1');
  log('Pikachu 025 →', r.donde);
  r = await guardar('charizard ex 151', { texto: '006/165', caja: 'Caja 1' }, 'Caja 1 · posición 1 de 2');
  log('Charizard ex 006 →', r.donde);
  r = await guardar('pikachu 151', { texto: '025/165', caja: 'Caja 1' }, 'Caja 1 · posición 2 de 2');
  if (!/Cantidad actualizada/.test(r.titulo)) throw new Error('no fusionó la copia repetida: ' + r.titulo);
  log('segunda copia fusionada →', r.titulo);
  r = await guardar('base set charizard', { texto: '4/102', caja: 'Caja 2' }, 'Caja 2 · posición 1 de 1');
  log('Charizard Base Set en Caja 2 →', r.donde);
  r = await guardar('pikachu 151', { texto: '025/165', caja: 'Caja 1', acabado: 'Reverse' }, 'Caja 1 · posición 3 de 3');
  log('Pikachu reverse (otra entrada) →', r.donde);

  // ---------- Mi colección con valor
  await page.goto(APP + '/app');
  await page.waitForSelector('text=valor estimado');
  await page.waitForFunction(() => /\(\d*[1-9]\d* con precio de mercado\)/.test(document.querySelector('.stat')?.textContent || ''), null, { timeout: 30000 });
  const stat = await page.textContent('.stat');
  if (!/5cartas \(4 distintas\)/.test(stat) || !/S\/ [1-9]/.test(stat)) throw new Error('resumen inesperado: ' + stat);
  await foto(page, 'mi-coleccion');
  log('Mi colección:', stat.replace(/\s+/g, ' ').slice(0, 120));

  // ---------- detalle de la caja: orden físico
  await page.goto(APP + '/app/cajas');
  await page.click('.box-card >> text=Caja 1');
  await page.waitForSelector('.entry-row');
  const orden = await page.$$eval('.entry-row .num', els => els.map(e => e.textContent.trim()));
  if (orden.join(',') !== '006/165,025/165,025/165') throw new Error('orden físico inesperado: ' + orden.join(','));
  await foto(page, 'caja-1');
  log('orden físico en Caja 1:', orden.join(' → '));
  // editar entrada: mover a Caja 2
  await page.click('.entry-row >> nth=0');
  await page.waitForSelector('.sheet');
  await page.selectOption('.sheet select >> nth=-1', { label: '📦 Caja 2' });
  await page.click('text=Guardar cambios');
  await page.waitForSelector('.toast');
  await page.waitForFunction(() => document.querySelectorAll('.entry-row').length === 2);
  log('Charizard ex movido a Caja 2');

  // ---------- Fase 2 · B: caja en venta, publicaciones automáticas, precio manual, fotos, Mis ventas
  // Caja 1 (Pikachu ×2 y Pikachu reverse) → "Caja en venta": se publican con el precio por defecto.
  // Con los precios del mock (Pikachu normal S/ 73.30, reverse S/ 183.30) superan S/ 50 → pausadas hasta tener foto.
  await page.click('[data-testid=switch-venta]');
  await page.click('.sheet-foot button:has-text("Poner en venta")');
  await page.waitForSelector('.toast:has-text("Caja en venta")');
  await page.waitForFunction(() => document.querySelectorAll('.entry-row .pill.warn').length === 2, null, { timeout: 15000 });
  let pubs = sql("select p.estado || ':' || p.motivo_pausa || ':' || p.cantidad || ':' || p.precio_pen from public.publicaciones p join public.entradas e on e.id = p.entrada_id where e.carta_id = 'sv03.5-025' order by e.acabado");
  if (pubs.split('\n').sort().join(',') !== 'pausada:foto:1:183.30,pausada:foto:2:73.30') throw new Error('publicaciones inesperadas al poner la caja en venta: ' + pubs);
  if (sql("select en_venta::text || '/' || preguntar_venta::text from public.cajas where nombre = 'Caja 1'") !== 'true/false') throw new Error('la caja no quedó en venta');
  await foto(page, 'caja-en-venta');
  log('Caja 1 en venta: 2 publicaciones con precio por defecto, pausadas por falta de foto (> S/ 50)');

  // carta nueva en la caja en venta → se publica sola y queda activa (Bulbasaur S/ 15.06 < S/ 50)
  await page.goto(APP + '/app');
  await page.fill('.search-wrap input', 'bulbasaur 151');
  await page.waitForSelector('.card-row');
  await page.locator('.card-row', { hasText: '001/165' }).first().locator('text=+ Guardar en una caja').click();
  await page.waitForSelector('.sheet');
  await page.click('.sheet .chipbtn:has-text("Caja 1")');
  await page.click('.sheet-foot >> text=Guardar');
  await page.waitForSelector('[data-testid=publicada]', { timeout: 15000 });
  const txtPub = await page.textContent('[data-testid=publicada]');
  if (!/en venta S\/ 15\.06/.test(txtPub)) throw new Error('la carta nueva no se publicó sola: ' + txtPub);
  await foto(page, 'publicada-sola');
  await page.click('.sheet-foot >> text=Listo');
  if (sql("select estado || ':' || precio_pen || ':' || tipo_precio from public.publicaciones where carta_id = 'sv03.5-001'") !== 'activa:15.06:defecto') throw new Error('publicación automática incorrecta');
  log('carta nueva en caja en venta → publicada sola y activa a S/ 15.06');

  // Caja 2 (no en venta) → al guardar pregunta; "Solo esta carta"
  await page.goto(APP + '/app');
  await page.fill('.search-wrap input', 'charmander 151');
  await page.waitForSelector('.card-row');
  await page.locator('.card-row', { hasText: '004/165' }).first().locator('text=+ Guardar en una caja').click();
  await page.waitForSelector('.sheet');
  await page.click('.sheet .chipbtn:has-text("Caja 2")');
  await page.click('.sheet-foot >> text=Guardar');
  await page.waitForSelector('[data-testid=pregunta-venta]');
  await foto(page, 'pregunta-venta');
  await page.click('[data-testid=pregunta-venta] button:has-text("Solo esta carta")');
  await page.waitForSelector('[data-testid=publicada]', { timeout: 15000 });
  await page.click('.sheet-foot >> text=Listo');
  if (sql("select estado || ':' || precio_pen from public.publicaciones where carta_id = 'sv03.5-004'") !== 'activa:16.54') throw new Error('"Solo esta carta" no publicó');
  if (num("select count(*) from public.publicaciones where estado = 'activa'") !== 2) throw new Error('debía haber 2 publicaciones activas');
  log('pregunta al guardar en caja no en venta → "Solo esta carta" publicada a S/ 16.54');

  // precio manual 80 sin foto → pausada; con foto → activa; volver al precio por defecto
  await page.goto(APP + '/app/cajas');
  await page.click('.box-card >> text=Caja 2');
  await page.waitForSelector('.entry-row');
  await page.click('.entry-row:has-text("004/165")');
  await page.waitForSelector('[data-testid=mercado-entrada]');
  await page.click('[data-testid=mercado-entrada] button');
  await page.waitForSelector('.sheet:has-text("Tu publicación")');
  await page.check('.sheet label.check:has-text("Precio manual") input');
  await page.fill('.sheet input[inputmode=decimal]', '80');
  await page.waitForSelector('.sheet:has-text("por encima del valor de mercado")');
  const recibes = await page.textContent('.sheet:has-text("Tu publicación") >> text=/Recibirás/');
  if (!/S\/ 76\.00/.test(recibes)) throw new Error('neto del vendedor incorrecto (80 − 5 %): ' + recibes);
  await page.click('.sheet:has-text("Tu publicación") .sheet-foot >> text=Guardar cambios');
  await page.waitForSelector('.toast:has-text("pausada")');
  if (sql("select estado || ':' || motivo_pausa || ':' || precio_pen from public.publicaciones where carta_id = 'sv03.5-004'") !== 'pausada:foto:80.00') throw new Error('precio > 50 sin foto debía pausar');
  await foto(page, 'pausada-sin-foto');
  fs.writeFileSync('/tmp/foto-carta.png', png(1800, 2500, [200, 40, 40]));
  await page.setInputFiles('.sheet input[type=file]', '/tmp/foto-carta.png');
  await page.waitForSelector('.toast:has-text("Foto agregada: publicación activa")', { timeout: 20000 });
  await page.waitForSelector('.sheet img[src*="fotos-publicaciones"]');
  const urlFoto = await page.getAttribute('.sheet img[src*="fotos-publicaciones"]', 'src');
  const rFoto = await fetch(urlFoto);
  if (!rFoto.ok || !(rFoto.headers.get('content-type') || '').startsWith('image/')) throw new Error('la foto no se puede ver públicamente: ' + rFoto.status);
  if ((await rFoto.arrayBuffer()).byteLength > 900 * 1024) throw new Error('la foto no se comprimió');
  if (sql("select estado || ':' || coalesce(motivo_pausa, '') || ':' || array_length(fotos, 1) from public.publicaciones where carta_id = 'sv03.5-004'") !== 'activa::1') throw new Error('con foto debía activarse');
  await foto(page, 'activa-con-foto');
  await page.click('.sheet button:has-text("Volver al precio por defecto")');
  await page.click('.sheet:has-text("Tu publicación") .sheet-foot >> text=Guardar cambios');
  await page.waitForSelector('.toast:has-text("Publicación actualizada")');
  if (sql("select tipo_precio || ':' || precio_pen from public.publicaciones where carta_id = 'sv03.5-004'") !== 'defecto:16.54') throw new Error('no volvió al precio por defecto');
  log('precio manual S/ 80 sin foto → pausada; foto comprimida y pública → activa; vuelta al precio por defecto S/ 16.54');

  // cantidad de la entrada → la publicación se ajusta sola
  await page.goto(APP + '/app/cajas');
  await page.click('.box-card >> text=Caja 1');
  await page.waitForSelector('.entry-row');
  await page.click('.entry-row:has-text("025/165") >> nth=0');
  await page.waitForSelector('.sheet');
  await page.click('.sheet .stepper button >> nth=0');   // 2 → 1
  await page.click('text=Guardar cambios');
  await page.waitForSelector('.toast:has-text("Guardado")');
  if (sql("select p.cantidad from public.publicaciones p join public.entradas e on e.id = p.entrada_id where e.carta_id = 'sv03.5-025' and e.acabado = ''") !== '1') throw new Error('la publicación no siguió a la cantidad de la entrada');
  log('cantidad de la entrada 2 → 1: la publicación se ajustó sola');

  // Mis ventas: lista, aviso de fotos, pausar/activar en bloque, retirar (borra la foto)
  await page.goto(APP + '/app/ventas');
  await page.waitForSelector('[data-testid=fila-venta]');
  if ((await page.$$('[data-testid=fila-venta]')).length !== 4) throw new Error('Mis ventas debía listar 4 publicaciones');
  if (!/2 publicaciones están pausadas/.test(await page.textContent('[data-testid=aviso-fotos]'))) throw new Error('sin aviso de fotos pendientes');
  await foto(page, 'mis-ventas');
  await page.click('text=Seleccionar todas');
  await page.click('[data-testid=barra-ventas] button:has-text("Pausar 2")');
  await page.waitForSelector('.toast:has-text("2 publicaciones pausadas")');
  if (num("select count(*) from public.publicaciones where estado = 'pausada'") !== 4) throw new Error('pausar en bloque falló');
  await page.click('text=Seleccionar todas');
  await page.click('[data-testid=barra-ventas] button:has-text("Activar 2")');   // las pausadas por foto no se pueden activar a mano
  await page.waitForSelector('.toast:has-text("2 publicaciones activadas")');
  if (num("select count(*) from public.publicaciones where estado = 'activa'") !== 2) throw new Error('activar en bloque falló');
  await page.click('[data-testid=fila-venta]:has-text("004/165") input[type=checkbox]');
  await page.click('[data-testid=barra-ventas] button:has-text("Retirar 1")');
  await page.click('.sheet-foot >> text=Retirar');
  await page.waitForSelector('.toast:has-text("1 publicación retirada")');
  if (sql("select estado || ':' || coalesce(array_length(fotos, 1), 0) from public.publicaciones where carta_id = 'sv03.5-004'") !== 'retirada:0') throw new Error('retirar no limpió la publicación');
  if ((await (await fetch(MOCK + '/__objetos')).json()).length !== 0) throw new Error('la foto no se borró del almacenamiento al retirar');
  if ((await page.$$('[data-testid=fila-venta]')).length !== 3) throw new Error('la retirada sigue en la lista');
  log('Mis ventas: pausar/activar en bloque y retirar (foto borrada del almacenamiento)');

  // mercado público: otro usuario (anónimo) solo ve publicaciones activas y el nombre de usuario del vendedor
  const rMercado = await fetch(MOCK + '/rest/v1/mercado?select=*&order=precio_pen', { headers: { apikey: 'anon-de-prueba', Authorization: 'Bearer anon-de-prueba' } });
  const mercado = await rMercado.json();
  if (!Array.isArray(mercado) || mercado.length !== 1 || mercado[0].carta_id !== 'sv03.5-001' || mercado[0].vendedor !== 'chris_tcg') throw new Error('vista mercado inesperada: ' + JSON.stringify(mercado).slice(0, 300));
  for (const k of ['dni', 'telefono', 'nombres', 'apellidos', 'email', 'usuario_id']) if (k in mercado[0]) throw new Error('la vista mercado expone ' + k);
  log('vista pública del mercado: 1 activa, solo @vendedor, sin datos personales');

  // borrar la entrada → la publicación desaparece
  await page.goto(APP + '/app/cajas');
  await page.click('.box-card >> text=Caja 1');
  await page.waitForSelector('.entry-row');
  await page.click('.entry-row:has-text("001/165")');
  await page.waitForSelector('.sheet');
  await page.click('.sheet-foot >> text=Eliminar');
  await page.click('.sheet:has-text("Eliminar carta") .sheet-foot >> text=Eliminar');
  await page.waitForSelector('.toast:has-text("eliminada")');
  if (num("select count(*) from public.publicaciones where carta_id = 'sv03.5-001'") !== 0) throw new Error('la publicación no se borró con la entrada');
  log('entrada eliminada → publicación eliminada');

  // ---------- Fase 2 · C: mercado, carrito y reservas
  // Otra coleccionista (creada directo en la base) pone una caja en venta: Bulbasaur ×3, Charmander reverse ×1, Caterpie ×2
  const LUCIA = '44444444-4444-4444-8444-444444444444', CAJA_LUCIA = '55555555-5555-4555-8555-555555555555';
  sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${LUCIA}', 'vendedora@correo.pe', '{\"username\":\"vendedora_lima\",\"nombres\":\"Lucía\",\"apellidos\":\"Torres\",\"telefono\":\"912345678\",\"dni\":\"87654321\",\"acepto_terminos\":true}')`);
  sql(`insert into public.cajas (id, usuario_id, nombre, orden) values ('${CAJA_LUCIA}', '${LUCIA}', 'Caja Lucía', 1)`);
  sql(`insert into public.entradas (usuario_id, caja_id, carta_id, cantidad, acabado, idioma, condicion) values ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-001', 3, 'Normal', 'ES', 'Buena'), ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-004', 1, 'Reverse', 'EN', ''), ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-010', 2, '', 'ES', '')`);
  sql(`update public.cajas set en_venta = true where id = '${CAJA_LUCIA}'`);
  if (num(`select count(*) from public.publicaciones where usuario_id = '${LUCIA}' and estado = 'activa'`) !== 3) throw new Error('la caja de Lucía no se publicó');
  // pestaña Mercado: lista, búsqueda, filtros
  await page.goto(APP + '/app/mercado');
  await page.waitForSelector('[data-testid=fila-mercado]');
  if ((await page.$$('[data-testid=fila-mercado]')).length !== 3) throw new Error('el mercado debía listar 3 cartas');
  await foto(page, 'mercado');
  await page.fill('.search-wrap input', 'caterpie');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 1, null, { timeout: 15000 });
  const filaCat = await page.textContent('[data-testid=fila-mercado]');
  // Caterpie nunca se consultó en TCGdex: sin precio en caché el precio por defecto es el piso (S/ 1.00); la tarea diaria lo renueva
  if (!/@vendedora_lima/.test(filaCat) || !/S\/ 1\.00/.test(filaCat) || !/2 copias/.test(filaCat)) throw new Error('fila del mercado inesperada: ' + filaCat);
  await page.fill('.search-wrap input', '');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 3, null, { timeout: 15000 });
  await page.click('button:has-text("Filtros")');
  await page.selectOption('[data-testid=filtros-mercado] select >> nth=2', 'Reverse');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 1, null, { timeout: 15000 });
  if (!/Charmander/.test(await page.textContent('[data-testid=fila-mercado]'))) throw new Error('el filtro de acabado no funcionó');
  await page.click('text=Limpiar filtros');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 3, null, { timeout: 15000 });
  await page.check('label:has-text("Solo las que me faltan") input');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 2, null, { timeout: 15000 });   // Charmander ya la tengo
  await page.uncheck('label:has-text("Solo las que me faltan") input');
  log('mercado: 3 cartas en venta; búsqueda, filtro por acabado y "solo las que me faltan" OK');

  // detalle de la carta: "Disponible en la red" y agregar 2 copias al carrito
  await page.click('[data-testid=fila-mercado]:has-text("Bulbasaur")');
  await page.waitForSelector('[data-testid=resumen-ofertas]');
  const resumenOf = await page.textContent('[data-testid=resumen-ofertas]');
  if (!/3 copias desde S\/ 15\.06/.test(resumenOf)) throw new Error('resumen de ofertas inesperado: ' + resumenOf);
  await page.click('[data-testid=oferta] .stepper button >> nth=1');   // 1 → 2
  await page.click('[data-testid=btn-agregar]');
  await page.waitForSelector('.toast:has-text("Reservada en tu carrito (2 copias)")');
  await page.waitForSelector('[data-testid=chip-carrito]:has-text("2")');
  if (num(`select reservadas from public.publicaciones where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-001'`) !== 2) throw new Error('la reserva no descontó copias');
  if (num(`select disponibles from public.mercado where carta_id = 'sv03.5-001'`) !== 1) throw new Error('el mercado no muestra 1 copia disponible');
  await foto(page, 'ofertas-carta');
  log('detalle: 3 copias desde S/ 15.06 → 2 reservadas en el carrito (queda 1 en el mercado)');

  // carrito: total, Comprar = Próximamente, subir a 3 → la publicación queda reservada y sale del mercado
  await page.goto(APP + '/app/carrito');
  await page.waitForSelector('[data-testid=linea-carrito]');
  if ((await page.textContent('[data-testid=total-carrito]')) !== 'S/ 30.12') throw new Error('total del carrito incorrecto: ' + await page.textContent('[data-testid=total-carrito]'));
  await page.click('button:has-text("Comprar")');
  await page.waitForSelector('text=Próximamente');
  await page.click('[data-testid=linea-carrito] .stepper button >> nth=1');   // 2 → 3
  await page.waitForFunction(() => document.querySelector('[data-testid=total-carrito]')?.textContent === 'S/ 45.18', null, { timeout: 15000 });
  if (sql(`select estado || ':' || reservadas from public.publicaciones where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-001'`) !== 'reservada:3') throw new Error('con todas las copias apartadas debía quedar reservada');
  if (num(`select count(*) from public.mercado where carta_id = 'sv03.5-001'`) !== 0) throw new Error('una publicación reservada no debe salir en el mercado');
  await foto(page, 'carrito');
  // otro comprador no puede reservar lo que ya está apartado (misma función que usa la app)
  sql(`insert into auth.users (id, email, raw_user_meta_data) values ('66666666-6666-4666-8666-666666666666', 'otro@correo.pe', '{\"username\":\"otro_comprador\",\"acepto_terminos\":true}')`);
  const pubBulbasaur = sql(`select id from public.publicaciones where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-001'`);
  const intento = sql(`set role authenticated; select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false); select public.reservar_copia('${pubBulbasaur}', 1)`);
  if (!/no quedan copias/i.test(intento)) throw new Error('otro comprador pudo reservar copias ya apartadas: ' + intento);
  await page.click('[data-testid=linea-carrito] .stepper button >> nth=0');   // 3 → 2
  await page.waitForFunction(() => document.querySelector('[data-testid=total-carrito]')?.textContent === 'S/ 30.12', null, { timeout: 15000 });
  if (sql(`select estado || ':' || reservadas from public.publicaciones where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-001'`) !== 'activa:2') throw new Error('al bajar la cantidad debía volver a activa');
  log('carrito: total S/ 30.12, "Comprar" = Próximamente, 3 copias → reservada (otro comprador rechazado), 2 → activa');

  // mis propias publicaciones no se pueden comprar: publico mi Charmander desde Caja 2 (elegir cuáles)
  await page.goto(APP + `/app/cajas/${sql("select id from public.cajas where nombre = 'Caja 2'")}?elegir=1`);
  await page.waitForSelector('[data-testid=barra-seleccion]');
  await page.click('.entry-row:has-text("004/165")');
  await page.click('[data-testid=barra-seleccion] button:has-text("Publicar 1")');
  await page.waitForSelector('.toast:has-text("1 carta publicada")');
  await page.goto(APP + '/app/carta/sv03.5-004');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=oferta]').length === 2, null, { timeout: 15000 });
  const mias = await page.$$eval('[data-testid=oferta]', els => els.map(e => ({ mia: /tu publicación/.test(e.textContent), boton: !!e.querySelector('[data-testid=btn-agregar]') })));
  if (!mias.some(m => m.mia && !m.boton) || !mias.some(m => !m.mia && m.boton)) throw new Error('la oferta propia no debe tener botón de compra: ' + JSON.stringify(mias));
  await foto(page, 'oferta-propia');
  log('detalle de Charmander: mi oferta sin botón de compra, la de @vendedora_lima con botón');

  // quitar del carrito → las copias vuelven al mercado
  await page.goto(APP + '/app/carrito');
  await page.waitForSelector('[data-testid=linea-carrito]');
  await page.click('[data-testid=linea-carrito] button:has-text("Quitar")');
  await page.waitForSelector('text=Tu carrito está vacío');
  if (num(`select reservadas from public.publicaciones where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-001'`) !== 0) throw new Error('quitar del carrito no liberó las copias');
  // álbum: las que faltan y están en venta muestran "🛒 precio"
  await page.goto(APP + '/app/album/sv03.5');
  await page.waitForSelector('.album-red', { timeout: 20000 });
  const enRed = await page.$$eval('.album-red', els => els.map(e => e.textContent.trim()));
  if (enRed.length !== 2 || !enRed.every(t => /🛒 S\/ /.test(t))) throw new Error('las casillas que faltan no muestran el mercado: ' + enRed.join(' | '));   // Bulbasaur y Caterpie (Charmander la tengo)
  if (!/2 en venta/.test(await page.textContent('[data-testid=faltan-mercado]'))) throw new Error('el botón "las que faltan" no cuenta las ofertas');
  await foto(page, 'album-mercado');
  log('carrito vaciado (copias liberadas); álbum 151 marca 2 faltantes en venta');

  // ---------- Fase 2 · D: mazos meta (Limitless simulado en el mock) y "Comprar lo que me falta"
  let tarea = await correrTarea();
  if (tarea.tarea?.estado !== 'ok' || !/mazos actualizados/.test(tarea.hecho.join(' | '))) throw new Error('la tarea diaria no actualizó los mazos: ' + JSON.stringify(tarea).slice(0, 400));
  if (num('select count(*) from public.mazos_arquetipos') !== 3 || num('select count(*) from public.mazos_listas') !== 5) throw new Error('mazos incompletos en la base');
  const variantes = sql("select nombre || ':' || n_listas || ':' || mejor_puesto from public.mazos_variantes where arquetipo_id = 284 order by orden");
  if (variantes !== 'Dragapult ex:2:1\nDragapult Dusknoir:1:3') throw new Error('variantes inesperadas: ' + variantes);
  // segunda corrida: no vuelve a descargar listas ya guardadas
  tarea = await correrTarea();
  if (tarea.tarea?.detalle?.mazos?.nuevas !== 0) throw new Error('la segunda corrida volvió a descargar listas: ' + JSON.stringify(tarea.tarea?.detalle?.mazos));
  // Limitless caído: la tarea termina bien y se conserva la versión anterior
  await fetch(MOCK + '/__limitless?caido=1');
  tarea = await correrTarea();
  await fetch(MOCK + '/__limitless?caido=0');
  if (tarea.tarea?.estado !== 'ok' || !/se conserva/.test(tarea.hecho.join(' | ')) || num('select count(*) from public.mazos_variantes') !== 4) throw new Error('con Limitless caído debía conservarse la versión anterior: ' + JSON.stringify(tarea).slice(0, 300));
  log('tarea diaria: 3 arquetipos, 5 listas, 2 variantes de Dragapult (≥ 90 %); sin descargas repetidas; Limitless caído → se conserva');

  await page.goto(APP + '/app/mazos');
  await page.waitForSelector('[data-testid=fila-mazo]');
  if ((await page.$$('[data-testid=fila-mazo]')).length !== 3) throw new Error('la página de mazos debía listar 3 arquetipos');
  const filaDrag = await page.textContent('[data-testid=fila-mazo] >> nth=0');
  if (!/Dragapult ex/.test(filaDrag) || !/Tienes el \d+ %/.test(filaDrag) || !/2 variantes/.test(filaDrag)) throw new Error('fila de mazo inesperada: ' + filaDrag);
  await foto(page, 'mazos');
  await page.click('[data-testid=fila-mazo] >> nth=0');
  await page.waitForSelector('[data-testid=variante]');
  if ((await page.$$('[data-testid=variante]')).length !== 2) throw new Error('Dragapult debía mostrar 2 variantes');
  if (!(await page.textContent('body')).includes('la más completa para ti')) throw new Error('no se resalta la variante más completa');
  const resumenV = await page.textContent('[data-testid=resumen-variante]');
  if (!/tienes \d+ de 60/.test(resumenV) || !/costo aprox/.test(resumenV)) throw new Error('resumen de variante inesperado: ' + resumenV);
  // "Comprar lo que me falta": Lucía vende Bulbasaur ×3, Charmander reverse ×1 y Caterpie ×2 (mi propia oferta de Charmander no cuenta)
  await page.waitForSelector('[data-testid=btn-comprar-faltantes]:not([disabled])', { timeout: 15000 });
  const etiqueta = await page.textContent('[data-testid=btn-comprar-faltantes]');
  if (!/\(3 de \d+ en venta\)/.test(etiqueta)) throw new Error('botón de compra inesperado: ' + etiqueta);
  await page.click('[data-testid=btn-comprar-faltantes]');
  await page.waitForSelector('[data-testid=resultado-compra]', { timeout: 30000 });
  const resCompra = await page.textContent('[data-testid=resultado-compra]');
  if (!/6 copias agregadas/.test(resCompra)) throw new Error('resultado de compra inesperado: ' + resCompra);
  await page.waitForSelector('[data-testid=chip-carrito]:has-text("6")');
  if (num("select count(*) from public.reservas where estado = 'activa' and comprador_id = (select id from public.perfiles where username = 'chris_tcg')") !== 3) throw new Error('debía haber 3 reservas activas');
  await foto(page, 'mazo-detalle');
  log('mazos: lista con % que tengo, detalle con variantes y "Comprar lo que me falta" → 6 copias (3 reservas) en el carrito');

  // ---------- álbum automático
  await page.goto(APP + '/app/album');
  await page.waitForSelector('.album-card');
  const albumes = await page.$$eval('.album-card .album-title', els => els.map(e => e.textContent.trim()));
  if (!albumes.some(t => t.includes('151'))) throw new Error('no aparece el álbum 151: ' + albumes.join(' | '));
  await page.click('.album-card:has-text("151")');
  await page.waitForSelector('.album-cell');
  const total = await page.$$eval('.album-cell', els => els.length);
  const faltan = await page.$$eval('.album-cell.missing', els => els.length);
  if (total !== 207 || faltan !== 204) throw new Error(`álbum 151: ${total} celdas, ${faltan} faltan`);   // tengo 025, 006 y 004
  await page.click('text=Consultar el precio de las que faltan');
  await page.waitForFunction(() => /para completar/.test(document.querySelector('.stat')?.textContent || ''));
  await foto(page, 'album-151');
  log('álbum 151:', total, 'celdas,', faltan, 'faltan');

  // ---------- álbum físico
  await page.goto(APP + '/app/album');
  await page.click('text=+ Nuevo álbum');
  await page.fill('.sheet input.input >> nth=0', 'Carpeta azul');
  await page.fill('.sheet input[type=number] >> nth=0', '2');
  await page.click('.sheet-foot >> text=Crear');
  await page.waitForURL(/\/app\/album\/p\//, { timeout: 20000 });
  await page.waitForSelector('.pocket');
  await page.click('.pocket >> nth=0');
  await page.waitForSelector('.sheet .search-wrap input');
  await page.fill('.sheet .search-wrap input', 'charizard ex 151');
  await page.click('.sheet .card-row:has-text("006/165")');
  await page.waitForSelector('.pocket.filled');
  await page.click('text=Rellenar con una colección');
  await page.fill('.sheet input.input', 'Pokémon Card 151');
  await page.click('.set-item:has-text("SV2a")');
  await page.waitForFunction(() => document.querySelectorAll('.pocket.filled, .pocket.missing').length === 9, null, { timeout: 30000 });
  const bolsillos = await page.$$eval('.pocket', els => els.map(e => e.className.includes('filled') ? 'T' : e.className.includes('missing') ? 'F' : '.'));
  if (bolsillos.join('') !== 'TFFFFFFFF') throw new Error('bolsillos inesperados: ' + bolsillos.join(''));
  await foto(page, 'album-fisico');
  // mover bolsillo 1 → 5 tocando
  await page.click('.pocket >> nth=0');
  await page.click('text=Mover a otro bolsillo');
  await page.click('.pocket >> nth=4');
  await page.waitForFunction(() => document.querySelectorAll('.pocket')[4].className.includes('filled') && document.querySelectorAll('.pocket')[0].className.includes('missing'));
  const casillas = parseInt(sql('select count(*) from public.album_casillas'), 10);
  log('álbum físico: 18 bolsillos,', casillas, 'asignados, movimiento OK');

  // ---------- ajustes: perfil e importación v1
  await page.goto(APP + '/app/ajustes');
  await page.fill('input.input >> nth=0', 'Christian G.');
  await page.click('text=Guardar perfil');
  await page.waitForSelector('.toast:has-text("Perfil guardado")');
  const respaldo = { app: 'pokeboveda', v: 1, state: { boxes: [{ id: 'b1', name: 'Caja 1', order: 1, mode: 'auto' }, { id: 'b2', name: 'Caja vieja', order: 2, mode: 'manual' }], entries: [
    { id: 'e1', cardId: 'sv03.5-041', boxId: 'b1', qty: 3, variant: 'Normal', lang: 'ES', addedAt: 1700000000000 },
    { id: 'e2', cardId: 'sv10-001', boxId: 'b2', qty: 1, pos: 4, lang: 'EN' },
    { id: 'e3', cardId: null, custom: { name: 'Promo Lima', set: 'Evento', number: '001' }, boxId: 'b2', qty: 2 },
    { id: 'e4', cardId: 'inventada-999', boxId: 'b1', qty: 1 }
  ] } };
  fs.writeFileSync('/tmp/respaldo-v1.json', JSON.stringify(respaldo));
  await page.setInputFiles('input[type=file]', '/tmp/respaldo-v1.json');
  await page.waitForSelector('.sheet:has-text("Importar respaldo")');
  await page.click('text=Combinar (añadir a lo que ya tengo)');
  await page.waitForSelector('text=Importación terminada', { timeout: 30000 });
  const resImp = await page.textContent('.notice.ok');
  const nCajas = parseInt(sql("select count(*) from public.cajas where usuario_id = (select id from public.perfiles where username = 'chris_tcg')"), 10);
  const nEnt = parseInt(sql("select count(*) from public.entradas where usuario_id = (select id from public.perfiles where username = 'chris_tcg')"), 10);
  if (nCajas !== 3 || nEnt !== 9) throw new Error(`importación: ${nCajas} cajas, ${nEnt} entradas (${resImp})`);   // 5 propias + 4 importadas
  await foto(page, 'ajustes');
  log('importación v1:', resImp.trim());

  // exportar JSON
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('text=Exportar respaldo (.json)')]);
  const exportado = JSON.parse(fs.readFileSync(await descarga.path(), 'utf8'));
  if (exportado.entradas.length !== 9) throw new Error('exportación incompleta');
  log('exportación JSON:', exportado.entradas.length, 'entradas');

  // ---------- cerrar sesión, ingresar por usuario, recuperar contraseña
  await page.click('text=Cerrar sesión');
  await page.waitForURL(u => u.pathname === '/', { timeout: 20000 });
  await page.goto(APP + '/ingresar');
  await page.fill('input[autocomplete=username]', 'chris_tcg');
  await page.fill('input[type=password]', 'incorrecta');
  await page.click('button[type=submit]');
  await page.waitForSelector('.notice.danger');
  await page.fill('input[type=password]', 'clave12345');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/app/, { timeout: 20000 });
  await page.waitForSelector('text=valor estimado', { timeout: 60000 });
  log('ingreso por nombre de usuario OK (y contraseña incorrecta rechazada)');
  await page.goto(APP + '/app/ajustes');
  await page.click('text=Cerrar sesión');
  await page.waitForURL(u => u.pathname === '/');
  await page.goto(APP + '/recuperar');
  await page.fill('input.input', 'christian@correo.pe');
  await page.click('button[type=submit]');
  await page.waitForSelector('.notice.ok');
  const c3 = await correos();
  const rec = c3[c3.length - 1];
  if (!/contraseña/i.test(rec.subject)) throw new Error('sin correo de recuperación');
  const enlaceRec = /href="([^"]+\/auth\/confirmar[^"]+)"/.exec(rec.html)?.[1]?.replace(/&amp;/g, '&');
  await page.goto(enlaceRec);
  await page.waitForURL(/\/cuenta\/nueva-clave/, { timeout: 20000 });
  await page.fill('input[type=password] >> nth=0', 'nuevaclave99');
  await page.fill('input[type=password] >> nth=1', 'nuevaclave99');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/app/, { timeout: 20000 });
  await page.waitForSelector('text=Contraseña cambiada', { timeout: 60000 });
  log('recuperación de contraseña OK');
  await page.goto(APP + '/app/ajustes');
  await page.click('text=Cerrar sesión');
  await page.waitForURL(u => u.pathname === '/');
  await page.goto(APP + '/ingresar');
  await page.fill('input[autocomplete=username]', 'christian@correo.pe');
  await page.fill('input[type=password]', 'nuevaclave99');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/app/, { timeout: 20000 });
  log('ingreso con la contraseña nueva OK');

  // ---------- escritorio
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(APP + '/app');
  await page.waitForSelector('text=valor estimado', { timeout: 60000 });
  await foto(page, 'escritorio');

  if (erroresConsola.length) { console.log('Errores de consola:', erroresConsola.slice(0, 10)); }
  console.log('\nE2E OK ✔  capturas en', CAPTURAS);
} catch (e) {
  await foto(page, 'ERROR').catch(() => {});
  console.error('\nE2E FALLÓ en el paso', paso, ':', e.message);
  console.error('URL:', page.url());
  if (erroresConsola.length) console.error('Errores de consola:', erroresConsola.slice(0, 10));
  process.exitCode = 1;
} finally {
  await browser.close();
}
