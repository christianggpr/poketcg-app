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
const require = createRequire(process.env.PLAYWRIGHT_MODULES || '/opt/node-tools/node_modules/');
const { chromium } = require('playwright');

const APP = 'http://127.0.0.1:3000';
const MOCK = 'http://127.0.0.1:54321';
const CAPTURAS = '/tmp/e2e';
fs.mkdirSync(CAPTURAS, { recursive: true });
let paso = 0;
const log = (...a) => console.log(`[${++paso}]`, ...a);
async function foto(page, nombre) { await page.screenshot({ path: path.join(CAPTURAS, `${String(paso).padStart(2, '0')}-${nombre}.png`), fullPage: false }); }
const sql = q => execSync(`su postgres -c "psql -At -d poketcg_test -c \\"${q.replace(/"/g, '\\"')}\\""`).toString().trim();
const correos = async () => (await fetch(MOCK + '/__correos')).json();

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

  // ---------- cajas
  await page.goto(APP + '/app/cajas');
  await page.click('text=+ Nueva caja');
  await page.fill('.sheet input.input', 'Caja 1');
  await page.click('.sheet-foot >> text=Crear caja');
  await page.waitForSelector('.box-card >> text=Caja 1');
  await page.click('text=+ Nueva caja');
  await page.fill('.sheet input.input', 'Caja 2');
  await page.click('.sheet-foot >> text=Crear caja');
  await page.waitForSelector('.box-card >> text=Caja 2');
  await foto(page, 'cajas');
  log('dos cajas creadas');

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

  // ---------- álbum automático
  await page.goto(APP + '/app/album');
  await page.waitForSelector('.album-card');
  const albumes = await page.$$eval('.album-card .album-title', els => els.map(e => e.textContent.trim()));
  if (!albumes.some(t => t.includes('151'))) throw new Error('no aparece el álbum 151: ' + albumes.join(' | '));
  await page.click('.album-card:has-text("151")');
  await page.waitForSelector('.album-cell');
  const total = await page.$$eval('.album-cell', els => els.length);
  const faltan = await page.$$eval('.album-cell.missing', els => els.length);
  if (total !== 207 || faltan !== 205) throw new Error(`álbum 151: ${total} celdas, ${faltan} faltan`);
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
  const nCajas = parseInt(sql('select count(*) from public.cajas'), 10);
  const nEnt = parseInt(sql('select count(*) from public.entradas'), 10);
  if (nCajas !== 3 || nEnt !== 8) throw new Error(`importación: ${nCajas} cajas, ${nEnt} entradas (${resImp})`);
  await foto(page, 'ajustes');
  log('importación v1:', resImp.trim());

  // exportar JSON
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('text=Exportar respaldo (.json)')]);
  const exportado = JSON.parse(fs.readFileSync(await descarga.path(), 'utf8'));
  if (exportado.entradas.length !== 8) throw new Error('exportación incompleta');
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
