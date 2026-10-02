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
const requireProyecto = createRequire(import.meta.url); // dependencias del proyecto (exceljs)

const APP = 'http://127.0.0.1:3000';
const MOCK = 'http://127.0.0.1:54321';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-de-prueba';
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
  // cadena=no: aquí el propio script repite las llamadas (la cadena automática se prueba aparte)
  let r = await (await fetch(APP + '/api/tareas/tick?forzar=1&cadena=no', { headers: cabecerasCron })).json();
  for (let i = 0; i < 6 && r.pendiente; i++) r = await (await fetch(APP + '/api/tareas/tick?cadena=no', { headers: cabecerasCron })).json();
  return r;
};
const num = q => parseInt(sql(q), 10);
const pen = n => 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const reset = await fetch(MOCK + '/__reset', { method: 'POST' });
  if (!reset.ok) throw new Error('no se pudo reiniciar la base de prueba: ' + (await reset.text()));
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
  await page.waitForURL(/\/app\/album/, { timeout: 20000 });   // ?bienvenida=1 llega a Álbumes y se muestra el aviso
  await page.waitForSelector('text=Todavía no tienes álbumes', { timeout: 60000 });
  await foto(page, 'app-vacia');
  if (!(await page.textContent('body')).includes('Bienvenido')) throw new Error('sin mensaje de bienvenida');
  log('correo confirmado, sesión iniciada, catálogo cargado');

  // ---------- administrador: cargar catálogo
  sql("update public.perfiles set rol='admin' where username='chris_tcg'");
  await page.goto(APP + '/admin');
  await page.waitForSelector('text=usuarios registrados');
  if (parseInt(sql('select count(*) from public.cartas'), 10) < 34000 || process.env.E2E_CATALOGO === '1') {
    await page.click('[data-testid=admin-tabs] >> text=Catálogo');
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

  // ---------- cajas (Mejoras 1 · B: la app abre en Álbumes con dos pestañas; /app/cajas redirige a /app/bulk)
  await page.goto(APP + '/app');
  await page.waitForURL(/\/app\/album$/);
  if ((await page.$$('[data-testid=tabbar] a')).length !== 2 || !(await page.$('[data-testid=tabbar-coleccion].active')) || !(await page.$('[data-testid=sec-album].active'))) throw new Error('la app debía abrir en Mi Colección → Álbumes con 2 pestañas');
  await page.click('[data-testid=btn-perfil]');
  await page.waitForSelector('[data-testid=menu-perfil] [data-testid=menu-ajustes]');
  if (!(await page.$('[data-testid=menu-perfil] [data-testid=menu-salir]'))) throw new Error('el menú de perfil debía tener Cerrar sesión');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=menu-perfil]', { state: 'detached' });
  await page.goto(APP + '/app/cajas');
  await page.waitForURL(/\/app\/bulk$/);
  if (!(await page.$('[data-testid=sec-bulk].active'))) throw new Error('/app/cajas debía redirigir a /app/bulk con la sección Bulk activa');
  await page.click('text=+ Nuevo Bulk');
  await page.fill('.sheet input.input', 'Bulk 1');
  await page.click('.sheet-foot >> text=Crear Bulk');
  // Fase 2: al crear la caja se pregunta si se sube a la nube para vender
  await page.waitForSelector('[data-testid=pregunta-venta]');
  await page.click('[data-testid=pregunta-venta] button:has-text("Elegir cuáles")');
  await page.waitForSelector('.box-card >> text=Bulk 1');
  await page.click('text=+ Nuevo Bulk');
  await page.fill('.sheet input.input', 'Bulk 2');
  await page.click('.sheet-foot >> text=Crear Bulk');
  await page.waitForSelector('[data-testid=pregunta-venta]');
  await page.click('[data-testid=pregunta-venta] button:has-text("Elegir cuáles")');
  await page.waitForSelector('.box-card >> text=Bulk 2');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await foto(page, 'cajas');
  if (sql("select count(*) from public.cajas where en_venta") !== '0') throw new Error('las cajas no debían quedar en venta');
  log('dos cajas creadas (pregunta de venta respondida: elegir cuáles)');

  // ---------- guardar cartas desde Buscar
  async function guardar(q, idCarta, esperado) {
    await page.goto(APP + '/app/buscar');
    await page.fill('.search-wrap input', q);
    await page.waitForSelector('.card-row');
    const fila = page.locator('.card-row', { hasText: idCarta.texto }).first();
    await fila.locator('[data-testid=btn-guardar-fila]').click();
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
  let r = await guardar('pikachu 151', { texto: '025/165', caja: 'Bulk 1' }, 'Bulk 1 · posición 1 de 1');
  log('Pikachu 025 →', r.donde);
  r = await guardar('charizard ex 151', { texto: '006/165', caja: 'Bulk 1' }, 'Bulk 1 · posición 1 de 2');
  log('Charizard ex 006 →', r.donde);
  r = await guardar('pikachu 151', { texto: '025/165', caja: 'Bulk 1' }, 'Bulk 1 · posición 2 de 2');
  if (!/Cantidad actualizada/.test(r.titulo)) throw new Error('no fusionó la copia repetida: ' + r.titulo);
  log('segunda copia fusionada →', r.titulo);
  r = await guardar('base set charizard', { texto: '4/102', caja: 'Bulk 2' }, 'Bulk 2 · posición 1 de 1');
  log('Charizard Base Set en Caja 2 →', r.donde);
  r = await guardar('pikachu 151', { texto: '025/165', caja: 'Bulk 1', acabado: 'Reverse' }, 'Bulk 1 · posición 3 de 3');
  log('Pikachu reverse (otra entrada) →', r.donde);

  // ---------- Ajustes de layout 2 · 1: ya no hay sección "Buscar / Escanear"; el buscador con cámara está arriba de Mi Colección
  // (debajo del precio) y los resultados dicen dónde tengo cada carta, con Agregar y Ver en el mercado
  await page.goto(APP + '/app/album');
  await page.waitForSelector('[data-testid=coleccion-inicio-buscar]');
  if (await page.$('[data-testid=sec-buscar]')) throw new Error('Mi Colección ya no debía tener el chip Buscar / Escanear');
  if (!(await page.$('[data-testid=buscador-celular-coleccion] [data-testid=btn-camara]'))) throw new Error('el buscador de Mi Colección debía tener el botón de cámara');
  const ordenInicio = await page.$$eval('.contenido [data-testid=resumen-coleccion], [data-testid=buscador-celular-coleccion]', els => els.map(e => e.dataset.testid));
  if (ordenInicio.join(',') !== 'resumen-coleccion,buscador-celular-coleccion') throw new Error('el buscador debía ir debajo del precio de la colección: ' + ordenInicio.join(','));
  await page.fill('[data-testid=coleccion-inicio-buscar]', 'pikachu 151');
  await page.press('[data-testid=coleccion-inicio-buscar]', 'Enter');
  await page.waitForURL(/\/app\/buscar\?q=pikachu/);
  await page.waitForSelector('[data-testid=resultados-buscar] .card-row');
  if (await page.$('[data-testid=subtabs]') || !(await page.$('[data-testid=volver-celular]'))) throw new Error('los resultados de búsqueda debían ser una pantalla interior (volver, sin chips)');
  const filaPika = page.locator('[data-testid=resultados-buscar] .card-row', { hasText: '025/165' }).first();
  const dondePika = await filaPika.locator('[data-testid=donde-la-tengo]').textContent();
  if (!/×3/.test(dondePika) || !/Bulk 1/.test(dondePika) || !/#2 de 3/.test(dondePika) || !/#3 de 3/.test(dondePika)) throw new Error('el resultado no dice dónde tengo el Pikachu: ' + dondePika);
  if (!(await filaPika.locator('[data-testid=btn-guardar-fila]:has-text("Agregar")').count()) || !(await filaPika.locator('[data-testid=btn-ver-mercado]:has-text("Ver en el mercado")').count())) throw new Error('faltan los botones Agregar / Ver en el mercado');
  const filaNoTengo = page.locator('[data-testid=resultados-buscar] .card-row', { hasText: 'Todavía no la tienes' });
  if (!(await filaNoTengo.count())) throw new Error('las cartas que no tengo debían decir "Todavía no la tienes"');
  await foto(page, 'buscar-resultados');
  log('sin sección Buscar / Escanear: buscador con cámara debajo del precio; resultados con ubicación (Bulk 1 #2 de 3 y #3 de 3), Agregar y Ver en el mercado');

  // ---------- Mi colección con valor
  await page.goto(APP + '/app/buscar');
  await page.waitForSelector('text=precio estimado');
  // Mejoras 4 · F: el texto corto es "precio estimado"; cuántas tienen precio de mercado va en data-con-mercado (y en el title)
  await page.waitForFunction(() => parseInt(document.querySelector('.stat [data-con-mercado]')?.getAttribute('data-con-mercado') || '0', 10) > 0, null, { timeout: 30000 });
  const stat = await page.textContent('.stat');
  if (!/5cartas · 4 distintas/.test(stat) || !/S\/ [1-9]/.test(stat) || !/precio estimado/.test(stat)) throw new Error('resumen inesperado: ' + stat);
  await foto(page, 'mi-coleccion');
  log('Mi colección:', stat.replace(/\s+/g, ' ').slice(0, 120));

  // ---------- detalle de la caja: orden físico
  await page.goto(APP + '/app/bulk');
  await page.click('.box-card >> text=Bulk 1');
  await page.waitForSelector('.entry-row');
  const orden = await page.$$eval('.entry-row .num', els => els.map(e => e.textContent.trim()));
  if (orden.join(',') !== '006/165,025/165,025/165') throw new Error('orden físico inesperado: ' + orden.join(','));
  await foto(page, 'caja-1');
  log('orden físico en Bulk 1:', orden.join(' → '));
  // editar entrada: mover a Caja 2
  await page.click('.entry-row >> nth=0');
  await page.waitForSelector('.sheet');
  await page.selectOption('.sheet select >> nth=-1', { label: 'Bulk 2' });
  await page.click('text=Guardar cambios');
  await page.waitForSelector('.toast');
  await page.waitForFunction(() => document.querySelectorAll('.entry-row').length === 2);
  log('Charizard ex movido a Caja 2');

  // ---------- Fase 2 · B: caja en venta, publicaciones automáticas, precio manual, fotos, Mis ventas
  // Caja 1 (Pikachu ×2 y Pikachu reverse) → "Caja en venta": se publican con el precio por defecto.
  // Con los precios del mock (Pikachu normal S/ 73.30, reverse S/ 183.30) superan S/ 50 → pausadas hasta tener foto.
  await page.click('[data-testid=switch-venta]');
  await page.click('.sheet-foot button:has-text("Poner en venta")');
  await page.waitForSelector('.toast:has-text("Bulk en venta")');
  await page.waitForFunction(() => document.querySelectorAll('.entry-row .pill.warn').length === 2, null, { timeout: 15000 });
  let pubs = sql("select p.estado || ':' || p.motivo_pausa || ':' || p.cantidad || ':' || p.precio_pen from public.publicaciones p join public.entradas e on e.id = p.entrada_id where e.carta_id = 'sv03.5-025' order by e.acabado");
  if (pubs.split('\n').sort().join(',') !== 'pausada:foto:1:183.30,pausada:foto:2:73.30') throw new Error('publicaciones inesperadas al poner la caja en venta: ' + pubs);
  if (sql("select en_venta::text || '/' || preguntar_venta::text from public.cajas where nombre = 'Bulk 1'") !== 'true/false') throw new Error('la caja no quedó en venta');
  await foto(page, 'caja-en-venta');
  log('Bulk 1 en venta: 2 publicaciones con precio por defecto, pausadas por falta de foto (> S/ 50)');

  // carta nueva en la caja en venta → se publica sola y queda activa (Bulbasaur S/ 15.06 < S/ 50)
  await page.goto(APP + '/app/buscar');
  await page.fill('.search-wrap input', 'bulbasaur 151');
  await page.waitForSelector('.card-row');
  await page.locator('.card-row', { hasText: '001/165' }).first().locator('[data-testid=btn-guardar-fila]').click();
  await page.waitForSelector('.sheet');
  await page.click('.sheet .chipbtn:has-text("Bulk 1")');
  await page.click('.sheet-foot >> text=Guardar');
  await page.waitForSelector('[data-testid=publicada]', { timeout: 15000 });
  const txtPub = await page.textContent('[data-testid=publicada]');
  if (!/en venta S\/ 15\.06/.test(txtPub)) throw new Error('la carta nueva no se publicó sola: ' + txtPub);
  await foto(page, 'publicada-sola');
  await page.click('.sheet-foot >> text=Listo');
  if (sql("select estado || ':' || precio_pen || ':' || tipo_precio from public.publicaciones where carta_id = 'sv03.5-001'") !== 'activa:15.06:defecto') throw new Error('publicación automática incorrecta');
  log('carta nueva en caja en venta → publicada sola y activa a S/ 15.06');

  // Caja 2 (no en venta) → al guardar pregunta; "Solo esta carta"
  await page.goto(APP + '/app/buscar');
  await page.fill('.search-wrap input', 'charmander 151');
  await page.waitForSelector('.card-row');
  await page.locator('.card-row', { hasText: '004/165' }).first().locator('[data-testid=btn-guardar-fila]').click();
  await page.waitForSelector('.sheet');
  await page.click('.sheet .chipbtn:has-text("Bulk 2")');
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
  await page.goto(APP + '/app/bulk');
  await page.click('.box-card >> text=Bulk 2');
  await page.waitForSelector('.entry-row');
  await page.click('.entry-row:has-text("004/165")');
  await page.waitForSelector('[data-testid=mercado-entrada]');
  await page.click('[data-testid=mercado-entrada] button');
  await page.waitForSelector('.sheet:has-text("Tu publicación")');
  await page.check('.sheet label.check:has-text("Precio manual") input');
  await page.fill('.sheet input[inputmode=decimal]', '80');
  await page.waitForSelector('.sheet:has-text("por encima del precio de mercado")');
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
  await page.goto(APP + '/app/bulk');
  await page.click('.box-card >> text=Bulk 1');
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
  await page.goto(APP + '/app/bulk');
  await page.click('.box-card >> text=Bulk 1');
  await page.waitForSelector('.entry-row');
  await page.click('.entry-row:has-text("001/165")');
  await page.waitForSelector('.sheet');
  await page.click('.sheet-foot >> text=Eliminar');
  await page.click('.sheet:has-text("Eliminar carta") .sheet-foot >> text=Eliminar');
  await page.waitForSelector('.toast:has-text("eliminada")');
  if (num("select count(*) from public.publicaciones where carta_id = 'sv03.5-001'") !== 0) throw new Error('la publicación no se borró con la entrada');
  // Mejoras 1 · A1 (arreglo): dos hojas apiladas (editar → confirmar) que se cierran a la vez no deben dejar la página sin desplazamiento
  await page.waitForTimeout(300);
  const bloqueo = await page.evaluate(() => ({ overflow: document.body.style.overflow, hojas: document.querySelectorAll('.sheet-backdrop').length }));
  if (bloqueo.hojas !== 0 || bloqueo.overflow !== '') throw new Error('tras cerrar las dos hojas la página quedó bloqueada: ' + JSON.stringify(bloqueo));
  log('entrada eliminada → publicación eliminada; el desplazamiento queda libre tras cerrar las dos hojas apiladas');

  // ---------- Fase 2 · C: mercado, carrito y reservas
  // Otra coleccionista (creada directo en la base) pone una caja en venta: Bulbasaur ×3, Charmander reverse ×1, Caterpie ×2
  const LUCIA = '44444444-4444-4444-8444-444444444444', CAJA_LUCIA = '55555555-5555-4555-8555-555555555555';
  sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${LUCIA}', 'vendedora@correo.pe', '{\"username\":\"vendedora_lima\",\"nombres\":\"Lucía\",\"apellidos\":\"Torres\",\"telefono\":\"912345678\",\"dni\":\"87654321\",\"acepto_terminos\":true}')`);
  sql(`insert into public.cajas (id, usuario_id, nombre, orden) values ('${CAJA_LUCIA}', '${LUCIA}', 'Bulk Lucía', 1)`);
  sql(`insert into public.entradas (usuario_id, caja_id, carta_id, cantidad, acabado, idioma, condicion) values ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-001', 3, 'Normal', 'ES', 'MP'), ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-004', 1, 'Reverse', 'EN', ''), ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-010', 2, '', 'ES', '')`);
  sql(`update public.cajas set en_venta = true where id = '${CAJA_LUCIA}'`);
  if (num(`select count(*) from public.publicaciones where usuario_id = '${LUCIA}' and estado = 'activa'`) !== 3) throw new Error('la caja de Lucía no se publicó');
  // pestaña Mercado → Buscar en el mercado: lista, búsqueda, filtros
  await page.goto(APP + '/app/mercado/buscar');
  await page.waitForSelector('[data-testid=fila-mercado]');
  if ((await page.$$('[data-testid=fila-mercado]')).length !== 3) throw new Error('el mercado debía listar 3 cartas');
  await foto(page, 'mercado');
  await page.fill('[data-testid=buscar-mercado]', 'caterpie');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 1, null, { timeout: 15000 });
  const filaCat = await page.textContent('[data-testid=fila-mercado]');
  // Caterpie nunca se consultó en TCGdex: sin precio en caché el precio por defecto es el piso (S/ 1.00); la tarea diaria lo renueva
  if (!/@vendedora_lima/.test(filaCat) || !/S\/ 1\.00/.test(filaCat) || !/2 copias/.test(filaCat)) throw new Error('fila del mercado inesperada: ' + filaCat);
  await page.fill('[data-testid=buscar-mercado]', '');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 3, null, { timeout: 15000 });
  // Mejoras 4 · D: los filtros van en la hoja "Filtros" (celular) y quedan en la dirección
  await page.click('[data-testid=btn-filtros]');
  await page.selectOption('.sheet [data-testid=filtro-acabado]', 'Reverse');
  await page.click('[data-testid=btn-ver-resultados]');
  await page.waitForURL(/acabado=Reverse/);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 1, null, { timeout: 15000 });
  if (!/Charmander/.test(await page.textContent('[data-testid=fila-mercado]'))) throw new Error('el filtro de acabado no funcionó');
  await page.click('[data-testid=btn-limpiar-filtros]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 3, null, { timeout: 15000 });
  await page.click('[data-testid=solo-faltan]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 2, null, { timeout: 15000 });   // Charmander ya la tengo
  await page.click('[data-testid=solo-faltan]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=fila-mercado]').length === 3, null, { timeout: 15000 });
  log('mercado: 3 cartas en venta; búsqueda, filtro por acabado y "solo las que me faltan" OK');

  // Mejoras 1 · D: Inicio del Mercado con carruseles en loop ("Más vendidas" y "Mayor precio") que se mueven solos y se pausan al tocar
  await page.mouse.move(5, 5);   // el mouse del paso anterior no debe quedar sobre el carrusel (lo pausaría)
  await page.goto(APP + '/app/mercado');
  await page.waitForSelector('[data-testid=carrusel-precio-item]');
  if ((await page.$$('[data-testid=carrusel-vendidas-item]')).length !== 3 || (await page.$$('[data-testid=carrusel-precio-item]')).length !== 3) throw new Error('los carruseles debían mostrar las 3 cartas con stock');
  // Ajustes de layout · 1: sin ventas en 30 días el subtítulo dice "más publicadas"; y si la función mercado_destacados
  // no está en la base (como pasó en producción), los carruseles se arman igual desde la vista `mercado`
  if (!/más publicadas/.test(await page.textContent('[data-testid=carrusel-vendidas] .nota'))) throw new Error('sin ventas, "Más vendidas" debía decir "más publicadas"');
  sql('drop function if exists public.mercado_destacados(int)');
  await page.goto(APP + '/app/mercado');
  await page.waitForSelector('[data-testid=carrusel-precio-item]');
  if ((await page.$$('[data-testid=carrusel-vendidas-item]')).length !== 3 || (await page.$$('[data-testid=carrusel-precio-item]')).length !== 3) throw new Error('sin la función en la base, los carruseles debían armarse desde la vista mercado');
  const masCaraRespaldo = await page.textContent('[data-testid=carrusel-precio-item] >> nth=0');
  if (!/Charmander/.test(masCaraRespaldo)) throw new Error('"Mayor precio" (respaldo) debía empezar por la más cara: ' + masCaraRespaldo);
  execSync('su postgres -c "psql -q -d poketcg_test -f supabase/migrations/0007_ajustes_layout.sql"');
  if (sql("select count(*) from pg_proc where proname = 'mercado_destacados'") !== '1') throw new Error('0007_ajustes_layout.sql no volvió a crear la función');
  await page.goto(APP + '/app/mercado');
  await page.waitForSelector('[data-testid=carrusel-precio-item]');
  const masCara = sql(`select carta_id || '|' || precio_pen from public.mercado order by precio_pen desc limit 1`).split('|');
  const primeraCara = await page.textContent('[data-testid=carrusel-precio-item] >> nth=0');
  if (!primeraCara.includes(pen(masCara[1])) || !/Charmander/.test(primeraCara)) throw new Error('"Mayor precio" debía empezar por la oferta más cara (' + masCara.join(' ') + '): ' + primeraCara);
  if ((await page.getAttribute('[data-testid=carrusel-vendidas]', 'data-loop')) !== '1' || (await page.$$('[data-testid=carrusel-vendidas] .tarjeta')).length !== 6) throw new Error('el carrusel debía duplicar las tarjetas para el loop');
  const scroll0 = await page.$eval('[data-testid=carrusel-vendidas] .pista', el => el.scrollLeft);
  await page.waitForTimeout(1500);
  const scroll1 = await page.$eval('[data-testid=carrusel-vendidas] .pista', el => el.scrollLeft);
  if (scroll1 <= scroll0 + 10) throw new Error('el carrusel no se desplaza solo: ' + scroll0 + ' → ' + scroll1 + ' (pausado=' + await page.getAttribute('[data-testid=carrusel-vendidas]', 'data-pausado') + ')');
  await page.hover('[data-testid=carrusel-vendidas] .pista');
  await page.waitForSelector('[data-testid=carrusel-vendidas][data-pausado="1"]');
  const scroll2 = await page.$eval('[data-testid=carrusel-vendidas] .pista', el => el.scrollLeft);
  await page.waitForTimeout(800);
  if (Math.abs((await page.$eval('[data-testid=carrusel-vendidas] .pista', el => el.scrollLeft)) - scroll2) > 2) throw new Error('el carrusel debía pausarse con el mouse encima');
  await page.mouse.move(5, 5);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.waitForSelector('[data-testid=carrusel-vendidas-item]');
  const scrollR = await page.$eval('[data-testid=carrusel-vendidas] .pista', el => el.scrollLeft);
  await page.waitForTimeout(1200);
  if ((await page.$eval('[data-testid=carrusel-vendidas] .pista', el => el.scrollLeft)) !== scrollR) throw new Error('con "reducir movimiento" el carrusel no debe moverse solo');
  await page.emulateMedia({ reducedMotion: null });
  await foto(page, 'mercado-inicio');
  log('Inicio del Mercado: carruseles "Más vendidas" y "Mayor precio" (3 cartas, loop, se mueven solos, pausa al pasar el mouse, quietos con "reducir movimiento")');

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
  // la tienda de recojo se elige en la misma pantalla (layout v2): con una sola tienda queda elegida; «Continuar al pago» se prueba en la Fase 3 (más abajo)
  await page.waitForSelector('[data-testid=tiendas-carrito] [data-testid=tienda-opcion]');
  if (!(await page.$('[data-testid=btn-comprar]'))) throw new Error('el carrito debía mostrar «Continuar al pago»');
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
  log('carrito: total S/ 30.12, "Comprar" abre la elección de tienda, 3 copias → reservada (otro comprador rechazado), 2 → activa');

  // mis propias publicaciones no se pueden comprar: publico mi Charmander desde Caja 2 (elegir cuáles)
  await page.goto(APP + `/app/bulk/${sql("select id from public.cajas where nombre = 'Bulk 2'")}?elegir=1`);
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
  // álbum: las que faltan y están en venta muestran "En mercado · precio"
  await page.goto(APP + '/app/album/sv03.5');
  await page.waitForSelector('.album-red', { timeout: 20000 });
  // hoja de carpeta: 9 casillas por página; Bulbasaur (001) está en la página 1 y Caterpie (010) en la 2 (Charmander la tengo)
  const enRed1 = await page.$$eval('.album-red', els => els.map(e => e.textContent.trim()));
  if (enRed1.length !== 1 || !/En mercado · S\/ /.test(enRed1[0]) || !(await page.$('[data-testid=casilla-falta]:has-text("001") .album-red'))) throw new Error('la casilla de Bulbasaur no muestra el mercado: ' + enRed1.join(' | '));
  if ((await page.$$('.album-cell')).length !== 9 || !/Página 1 de 23/.test(await page.textContent('[data-testid=pagina-texto]'))) throw new Error('la hoja debía mostrar 9 casillas de 23 páginas');
  await page.click('[data-testid=pagina-siguiente]');
  await page.waitForSelector('[data-testid=casilla-falta]:has-text("010") .album-red:has-text("En mercado")');
  if ((await page.$$('.album-red')).length !== 1) throw new Error('en la página 2 solo Caterpie debía estar en venta');
  await page.click('[data-testid=pagina-anterior]');
  await page.click('[data-testid=btn-acciones]');
  if (!/2 en venta/.test(await page.textContent('[data-testid=faltan-mercado]'))) throw new Error('el botón "las que faltan" no cuenta las ofertas');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=menu-acciones]', { state: 'detached' });
  await foto(page, 'album-mercado');
  log('carrito vaciado (copias liberadas); álbum 151 marca 2 faltantes en venta');
  // Ajustes de layout 2 · 4 (celular): cuadrícula 3×3 (por defecto) · 3×4 · 4×5, recordada al recargar; "Ir a página" y el texto se adaptan
  const celdasCel = async () => (await page.$$('.album-cell')).length;
  const opcionesCel = await page.$$eval('[data-testid=selector-cuadricula] option', els => els.map(e => e.textContent.trim()));
  if (opcionesCel.join(' ') !== '3×3 3×4 4×5' || (await page.inputValue('[data-testid=selector-cuadricula]')) !== '3x3') throw new Error('selector de cuadrícula del celular inesperado: ' + opcionesCel.join(' '));
  await page.selectOption('[data-testid=selector-cuadricula]', '3x4');
  await page.waitForSelector('[data-testid=pagina-texto]:has-text("de 18")');
  if ((await celdasCel()) !== 12) throw new Error('3×4 debía mostrar 12 casillas');
  await page.reload();
  await page.waitForSelector('[data-testid=hoja-carpeta][data-cuadricula="3x4"]');
  if ((await celdasCel()) !== 12 || (await page.inputValue('[data-testid=selector-cuadricula]')) !== '3x4') throw new Error('la cuadrícula 3×4 debía recordarse al recargar');
  await page.selectOption('[data-testid=selector-cuadricula]', '4x5');
  await page.waitForSelector('[data-testid=pagina-texto]:has-text("de 11")');
  if ((await celdasCel()) !== 20) throw new Error('4×5 debía mostrar 20 casillas');
  await foto(page, 'album-4x5');
  await page.selectOption('[data-testid=selector-cuadricula]', '3x3');
  await page.waitForSelector('[data-testid=pagina-texto]:has-text("de 23")');
  log('cuadrícula del álbum en el celular: 3×3 → 3×4 (12 casillas, 18 páginas, recordada al recargar) → 4×5 (20 casillas, 11 páginas) → 3×3');

  // ---------- Mejoras 3 · C: agregar rápido desde el álbum (botón + en las casillas grises)
  {
    const CHRIS_ID = sql(`select id from public.perfiles where username = 'chris_tcg'`);
    const BULK1 = sql(`select id from public.cajas where usuario_id = '${CHRIS_ID}' and nombre = 'Bulk 1'`);
    // en la página 1 (3×3) faltan 001 (la comprada ya salió), 002, 003, 005, 007, 008, 009 → 7 botones + discretos (40 px, azul al 35 %), centrados en su casilla
    await page.waitForSelector('[data-testid=btn-mas-rapido]');
    const masBotones = await page.$$eval('[data-testid=btn-mas-rapido]', els => els.map(b => { const r = b.getBoundingClientRect(); const c = b.parentElement.querySelector('.pocket').getBoundingClientRect(); const cs = getComputedStyle(b); return { w: Math.round(r.width), h: Math.round(r.height), centrado: Math.abs((r.left + r.width / 2) - (c.left + c.width / 2)) < 2, fondo: cs.backgroundColor, borde: cs.borderTopWidth }; }));
    if (masBotones.length !== 7 || masBotones.some(b => b.w !== 40 || b.h !== 40 || !b.centrado || b.fondo !== 'rgba(31, 95, 204, 0.35)' || b.borde !== '1px')) throw new Error('botones + inesperados: ' + JSON.stringify(masBotones));
    // tocar la casilla fuera del + sigue abriendo la carta
    await page.click('[data-testid=casilla-falta]:has-text("002")', { position: { x: 10, y: 10 } });
    await page.waitForURL(/\/app\/carta\/sv03\.5-002/);
    await page.goto(APP + '/app/album/sv03.5?idioma=EN');
    await page.waitForSelector('[data-testid=btn-mas-rapido]');
    // el + de 002 abre la ventana completada: carta, casilla, Inglés · del álbum, NM; solo pide el acabado
    await page.click('.celda-libro:has([data-testid=casilla-falta]:has-text("002")) [data-testid=btn-mas-rapido]');
    await page.waitForSelector('.sheet.hoja-rapida');
    if ((await page.textContent('[data-testid=rapido-nombre]')) !== 'Ivysaur' || (await page.textContent('[data-testid=rapido-idioma]')) !== 'Inglés · del álbum' || (await page.textContent('[data-testid=rapido-estado]')) !== 'NM') throw new Error('la ventana rápida no vino completada: ' + await page.textContent('.sheet.hoja-rapida'));
    if (!/Casilla 002 · 151/.test(await page.textContent('[data-testid=rapido-cabecera]'))) throw new Error('faltaba "Casilla 002 · 151"');
    if ((await page.$$eval('[data-testid=acabados-rapido] button', els => els.map(e => e.textContent.trim()))).join(' · ') !== 'Normal · Holo · Reverse Holo · Otro…') throw new Error('botones de acabado inesperados');
    if (!(await page.$('[data-testid=acabados-rapido] button[aria-checked=true]'))) throw new Error('debía venir un acabado preseleccionado');
    if (!/Guardar y siguiente \(003\)/.test(await page.textContent('[data-testid=rapido-siguiente]'))) throw new Error('el botón debía decir "Guardar y siguiente (003)"');
    await foto(page, 'agregar-rapido');
    await page.click('[data-testid=acabado-reverse]');
    await page.click('[data-testid=rapido-siguiente]');
    // la casilla 002 pasa a color en el acto y la ventana sigue con la 003 (Venusaur ex), con Reverse preseleccionado (último acabado)
    await page.waitForSelector('[data-testid=casilla-tengo]:has-text("002")');
    await page.waitForSelector('[data-testid=rapido-nombre]:has-text("Venusaur")');
    if (!(await page.$('[data-testid=acabado-reverse][aria-checked=true]'))) throw new Error('debía recordar el último acabado (Reverse)');
    if (sql(`select acabado || '|' || idioma || '|' || condicion || '|' || coalesce(album_coleccion, '-') || '|' || cantidad from public.entradas where usuario_id = '${CHRIS_ID}' and carta_id = 'sv03.5-002'`) !== 'Reverse|EN|NM|sv03.5|1') throw new Error('la carta 002 no se guardó como Reverse · EN · NM en la casilla');
    // cantidad 2: una va al álbum y la otra al Bulk 1 (reglas de Mejoras 2); "Guardar" cierra la ventana
    await page.click('[data-testid=rapido-cantidad] button:has-text("+")');
    await page.waitForSelector('[data-testid=rapido-aviso-bulk]:has-text("Más de 1: una va al álbum y el resto a Bulk 1")');
    await page.click('[data-testid=rapido-guardar]');
    await page.waitForSelector('.sheet.hoja-rapida', { state: 'detached' });
    await page.waitForSelector('[data-testid=casilla-tengo]:has-text("003") .casilla-cant.bulk:has-text("+1")');
    if (sql(`select count(*) || ':' || sum(cantidad) || ':' || count(*) filter (where album_coleccion = 'sv03.5') || ':' || count(*) filter (where caja_id = '${BULK1}') from public.entradas where usuario_id = '${CHRIS_ID}' and carta_id = 'sv03.5-003'`) !== '2:2:1:1') throw new Error('con cantidad 2 debía quedar 1 en la casilla y 1 en Bulk 1');
    if (!/Página 1 de 23/.test(await page.textContent('[data-testid=pagina-texto]'))) throw new Error('al cerrar debía seguir en la misma página');
    // "Guardar y siguiente" desde la última casilla vacía de la página (009) pasa a la 010 cambiando de página; cerrar deja esa página
    await page.click('.celda-libro:has([data-testid=casilla-falta]:has-text("009")) [data-testid=btn-mas-rapido]');
    await page.waitForSelector('[data-testid=rapido-nombre]:has-text("Blastoise")');
    await page.click('[data-testid=rapido-siguiente]');
    await page.waitForSelector('[data-testid=rapido-nombre]:has-text("Caterpie")');
    await page.waitForSelector('[data-testid=pagina-texto]:has-text("Página 2 de 23")');
    await page.click('.rapido-cerrar');
    await page.waitForSelector('.sheet.hoja-rapida', { state: 'detached' });
    if (!/Página 2 de 23/.test(await page.textContent('[data-testid=pagina-texto]'))) throw new Error('tras cerrar debía quedar en la página 2');
    if (sql(`select count(*) from public.entradas where usuario_id = '${CHRIS_ID}' and carta_id = 'sv03.5-009' and album_coleccion = 'sv03.5'`) !== '1') throw new Error('la 009 debía quedar guardada en su casilla');
    // la casilla se llenó desde "otro dispositivo" (directo en la base): la ventana avisa y manda la copia a Bulk
    sql(`insert into public.entradas (usuario_id, caja_id, carta_id, cantidad, acabado, idioma, condicion, album_coleccion) values ('${CHRIS_ID}', null, 'sv03.5-011', 1, 'Normal', 'EN', 'NM', 'sv03.5')`);
    await page.click('.celda-libro:has([data-testid=casilla-falta]:has-text("011")) [data-testid=btn-mas-rapido]');
    await page.waitForSelector('[data-testid=rapido-ocupada]:has-text("ya tiene una copia")');
    await page.click('[data-testid=rapido-guardar]');
    await page.waitForSelector('.sheet.hoja-rapida', { state: 'detached' });
    if (sql(`select count(*) filter (where album_coleccion = 'sv03.5') || ':' || count(*) filter (where caja_id is not null) from public.entradas where usuario_id = '${CHRIS_ID}' and carta_id = 'sv03.5-011'`) !== '1:1') throw new Error('la copia de la casilla ocupada debía ir al Bulk');
    await foto(page, 'agregar-rapido-ocupada');
    // se deja todo como estaba para los pasos siguientes
    sql(`delete from public.entradas where usuario_id = '${CHRIS_ID}' and carta_id in ('sv03.5-002', 'sv03.5-003', 'sv03.5-009', 'sv03.5-010', 'sv03.5-011')`);
    // la ventana rápida pidió precios de esas cartas (quedan en caché): se quitan para que los pasos siguientes vean el mismo estado de antes
    sql(`delete from public.precios where carta_id in ('sv03.5-002', 'sv03.5-003', 'sv03.5-009', 'sv03.5-010', 'sv03.5-011')`);
    log('agregar rápido: + en las casillas grises (48 px); ventana con Inglés · del álbum y NM; Reverse recordado; cantidad 2 → casilla + Bulk 1; siguiente cambia de página y cerrar la conserva; casilla ocupada → Bulk');
  }

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

  // Mejoras 1 · A2: la tarea se encadena sola hasta terminar (con presupuesto 0 la primera llamada solo renueva el cambio)
  const primera = await (await fetch(APP + '/api/tareas/tick?forzar=1&presupuesto=0', { headers: cabecerasCron })).json();
  if (!primera.ok || !primera.pendiente || !primera.continuara) throw new Error('la primera llamada debía quedar pendiente y continuar en cadena: ' + JSON.stringify(primera).slice(0, 300));
  let encadenada = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const t = await (await page.request.get(APP + '/api/admin/tareas')).json();
    encadenada = t.tareas?.[0];
    if (encadenada?.estado === 'ok') break;
  }
  if (encadenada?.estado !== 'ok' || encadenada.detalle?.fase !== 'fin' || encadenada.detalle?.mazos?.arquetipos !== 3) throw new Error('la cadena no terminó la tarea sola: ' + JSON.stringify(encadenada?.detalle).slice(0, 300));
  // /admin: estado de los mazos, botón "Actualizar mazos ahora" con progreso, y tipo de cambio con fecha, hora y fuente
  sql('delete from public.mazos_variantes; delete from public.mazos_listas; delete from public.mazos_arquetipos;');
  await page.goto(APP + '/admin?tab=mercado');
  await page.waitForSelector('[data-testid=mazos-estado]:has-text("0 arquetipos")');
  if (!(await page.$('[data-testid=admin-mazos] .notice.warn'))) throw new Error('con menos de 15 arquetipos debía avisar');
  await page.click('[data-testid=btn-actualizar-mazos]');
  await page.waitForSelector('[data-testid=mazos-progreso]:has-text("listo")', { timeout: 60000 });
  if (!/Arquetipo 3 de 3/.test(await page.textContent('[data-testid=mazos-progreso]'))) throw new Error('el progreso no llegó a 3 de 3: ' + await page.textContent('[data-testid=mazos-progreso]'));
  await page.waitForSelector('[data-testid=mazos-estado]:has-text("3 arquetipos")');
  if (num('select count(*) from public.mazos_listas') !== 5 || num('select count(*) from public.mazos_variantes') !== 4) throw new Error('el botón no recargó los mazos completos');
  const fxTxt = await page.textContent('[data-testid=fx-vigente]');
  if (!/Última actualización: \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} \(hora de Lima/.test(fxTxt) || !/fuente: (open\.er-api\.com|respaldo)/.test(fxTxt)) throw new Error('el tipo de cambio no muestra fecha, hora y fuente: ' + fxTxt);
  await foto(page, 'admin-mazos');
  log('cadena automática de la tarea diaria (termina sola), botón "Actualizar mazos ahora" (3 de 3) y tipo de cambio con fecha/hora/fuente');

  await page.goto(APP + '/app/mazos');
  await page.waitForSelector('[data-testid=fila-mazo]');
  if ((await page.$$('[data-testid=fila-mazo]')).length !== 3) throw new Error('la página de mazos debía listar 3 arquetipos');
  // Mejoras 2 · D: Mazos vive en Mi Colección (chip activo y pestaña inferior marcada), ya no en el Mercado
  if (!(await page.$('[data-testid=tabbar-coleccion].active')) || !(await page.$('[data-testid=sec-mazos].active'))) throw new Error('Mazos debía aparecer marcado dentro de Mi Colección');
  await page.goto(APP + '/app/mercado');
  await page.waitForSelector('[data-testid=sec-ventas]');
  if (await page.$('[data-testid=sec-mazos]')) throw new Error('el Mercado ya no debía tener el chip de Mazos');
  // Ajustes de layout 2 · 2: Mercado = Inicio · Mis compras · Mis ventas; Mi Colección = Álbumes · Bulk · Mazos; Mis ventas marca la pestaña Mercado
  const chips = async () => (await page.$$eval('[data-testid=subtabs] a', els => els.map(e => e.textContent.trim().replace(/\s*\d+$/, '')))).join(' · ');
  if ((await chips()) !== 'Inicio · Mis compras · Mis ventas' || (await page.$('[data-testid=sec-carrito]'))) throw new Error('chips del Mercado inesperados: ' + await chips());
  // Ajustes de layout 2 · 3: el carrito es solo el botón amarillo (arriba a la derecha); /app/carrito es una pantalla interior
  if (!(await page.$('[data-testid=chip-carrito]'))) throw new Error('faltaba el botón amarillo del carrito');
  await page.goto(APP + '/app/carrito');
  await page.waitForSelector('[data-testid=volver-celular]');
  if (await page.$('[data-testid=subtabs]')) throw new Error('el carrito no debía mostrar chips');
  await page.goto(APP + '/app/ventas');
  await page.waitForSelector('[data-testid=sec-ventas].active');
  if (!(await page.$('[data-testid=tabbar-mercado].active')) || (await page.$('[data-testid=tabbar-coleccion].active'))) throw new Error('Mis ventas debía marcar la pestaña Mercado');
  await page.goto(APP + '/app/album');
  await page.waitForSelector('[data-testid=sec-album].active');
  if ((await chips()) !== 'Álbumes · Bulk · Mazos') throw new Error('chips de Mi Colección inesperados: ' + await chips());
  log('secciones: Mi Colección = Álbumes · Bulk · Mazos; Mercado = Inicio · Mis compras · Mis ventas (Mis ventas marca Mercado); carrito solo como botón amarillo');
  await page.goto(APP + '/app/mazos');
  await page.waitForSelector('[data-testid=fila-mazo]');
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

  // ---------- Fase 3 · A: tienda de entrega, compra con Yape/Plin, comprobante, confirmación y verificación por WhatsApp
  await page.goto(APP + '/admin?tab=tiendas');
  await page.waitForSelector('[data-testid=admin-tiendas]');
  await page.click('text=+ Nueva tienda');
  await page.waitForSelector('.sheet input.input');
  await page.fill('.sheet input.input >> nth=0', 'Tienda E2E');
  await page.fill('.sheet input.input >> nth=1', 'Lince');
  await page.fill('.sheet input.input >> nth=3', 'Av. Arenales 1624');
  await page.fill('.sheet input.input >> nth=4', 'Galería FullMarket, 2.º piso');
  await page.fill('.sheet input.input >> nth=5', 'L–S 12:00–20:00');
  await page.click('.sheet-foot >> text=Guardar');
  await page.waitForSelector('[data-testid=admin-tienda]:has-text("Tienda E2E")');
  await page.click('[data-testid=admin-tabs] >> text=Cobros y pagos');
  await page.waitForSelector('[data-testid=admin-ajustes-pagos] input');
  if ((await page.inputValue('[data-testid=admin-ajustes-pagos] input >> nth=0')) !== '949114582') throw new Error('el Yape de la app no está precargado');
  await foto(page, 'admin-tiendas');
  log('admin: tienda creada; Yape/Plin 949114582 precargado');

  // comprar el carrito (3 reservas de @vendedora_lima) → elegir tienda → pago pendiente con instrucciones
  await page.goto(APP + '/app/carrito');
  await page.waitForSelector('[data-testid=tienda-opcion]');
  const totalCarrito = await page.textContent('[data-testid=total-carrito]');
  await page.click('[data-testid=tienda-opcion]:has-text("Tienda E2E")');
  await page.click('[data-testid=btn-comprar]');
  await page.waitForURL(/\/app\/compras\/[0-9a-f-]+/, { timeout: 20000 });
  const pagoId = page.url().split('/').pop();
  await page.waitForSelector('[data-testid=instrucciones-pago]');
  const instrucciones = await page.textContent('[data-testid=instrucciones-pago]');
  if (!/949\s?114\s?582/.test(instrucciones) || !/CHRISTIAN GABRIEL/.test(instrucciones) || !/Yape o Plin/.test(instrucciones)) throw new Error('instrucciones de pago inesperadas: ' + instrucciones.slice(0, 200));
  if (sql(`select estado || ':' || monto from public.pagos where id = '${pagoId}'`) !== 'pendiente:' + totalCarrito.replace('S/ ', '').replace(',', '')) throw new Error('pago inesperado: ' + sql(`select estado || ':' || monto from public.pagos where id = '${pagoId}'`) + ' vs ' + totalCarrito);
  if (num(`select count(*) from public.ordenes where pago_id = '${pagoId}'`) !== 1 || num(`select count(*) from public.orden_items oi join public.ordenes o on o.id = oi.orden_id where o.pago_id = '${pagoId}'`) !== 3) throw new Error('la compra debía tener 1 orden con 3 ítems');
  if (num(`select count(*) from public.mi_carrito()`) !== 0 && (await page.$('[data-testid=chip-carrito]'))) { /* el carrito queda vacío al pasar a compra */ }
  await foto(page, 'compra-pendiente');
  log('compra creada: pago pendiente por', totalCarrito, '· 1 orden (vendedora_lima) con 3 cartas');

  // comprobante (captura + n.º de operación) → revisión; el administrador (chris) recibe correo y notificación
  await page.setInputFiles('[data-testid=input-voucher]', '/tmp/foto-carta.png');
  await page.fill('[data-testid=input-operacion]', '0001234');
  await page.click('[data-testid=btn-enviar-comprobante]');
  await page.waitForSelector('text=Recibimos tu comprobante', { timeout: 20000 });
  if (sql(`select estado || ':' || n_operacion from public.pagos where id = '${pagoId}'`) !== 'revision:0001234') throw new Error('el comprobante no dejó el pago en revisión');
  await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid=chip-notificaciones] .cuenta')?.textContent || ''), null, { timeout: 15000 });
  const correosPago = (await correos()).filter(c => /Pago por confirmar/.test(c.subject));
  if (!correosPago.length || !/0001234/.test(correosPago[correosPago.length - 1].text || correosPago[correosPago.length - 1].html)) throw new Error('el administrador no recibió el correo del pago');
  log('comprobante enviado: pago en revisión, correo al administrador con la operación 0001234, campana con avisos');

  // administrador confirma → orden con código de retiro y fecha límite, copias vendidas fuera del mercado, vendedora avisada (correo + WhatsApp)
  await page.goto(APP + '/admin?tab=pagos');
  await page.waitForSelector('[data-testid=admin-pago]:has-text("0001234")');
  await page.click('[data-testid=admin-pago]:has-text("0001234") [data-testid=btn-confirmar-pago]');
  await page.waitForSelector('.toast:has-text("confirmado")');
  if (sql(`select estado from public.pagos where id = '${pagoId}'`) !== 'confirmado') throw new Error('el pago no quedó confirmado');
  const ordenConf = sql(`select estado || ':' || codigo_retiro || ':' || fecha_limite from public.ordenes where pago_id = '${pagoId}'`);
  if (!/^pago_confirmado:\d{6}:\d{4}-\d{2}-\d{2}$/.test(ordenConf)) throw new Error('orden inesperada tras confirmar: ' + ordenConf);
  if (num(`select count(*) from public.mercado where carta_id = 'sv03.5-001'`) !== 0 || num(`select count(*) from public.publicaciones where usuario_id = '${LUCIA}' and estado = 'vendida'`) !== 3) throw new Error('las copias vendidas siguen en el mercado');
  // stock: las copias vendidas salen de la colección de la vendedora al confirmarse (quedan guardadas en la orden para devolverlas si vence)
  if (num(`select count(*) from public.entradas where usuario_id = '${LUCIA}'`) !== 0) throw new Error('las copias vendidas siguen en la colección de la vendedora');
  if (num(`select count(*) from public.orden_items where orden_id = (select id from public.ordenes where pago_id = '${pagoId}') and descontado_en is not null and entrada_datos->>'caja_id' = '${CAJA_LUCIA}'`) !== 3) throw new Error('la orden no guardó de dónde salieron las copias');
  const avisoVenta = sql(`select cuerpo from public.notificaciones where usuario_id = '${LUCIA}' and tipo = 'venta_confirmada' order by id desc limit 1`);
  if (!/Tienda E2E/.test(avisoVenta) || !/Bulk Lucía/.test(avisoVenta)) throw new Error('el aviso a la vendedora no trae tienda y ubicación: ' + avisoVenta);
  if (!(await correos()).some(c => /Vendiste/.test(c.subject) && c.to?.includes?.('vendedora@correo.pe') || /Vendiste/.test(c.subject))) throw new Error('la vendedora no recibió el correo de venta');
  await page.click('[data-testid=admin-tabs] >> text=WhatsApp');
  await page.waitForSelector('[data-testid=admin-wsp]:has-text("@vendedora_lima")');
  const wa = await page.getAttribute('[data-testid=admin-wsp]:has-text("@vendedora_lima") a', 'href');
  if (!/wa\.me\/51912345678\?text=/.test(wa)) throw new Error('enlace de WhatsApp inesperado: ' + wa);
  await page.click('[data-testid=admin-wsp]:has-text("@vendedora_lima") >> text=Enviado');
  await page.waitForSelector('[data-testid=admin-wsp]:has-text("@vendedora_lima")', { state: 'detached' });
  await foto(page, 'admin-pagos');
  log('pago confirmado: orden', ordenConf.split(':')[0], '· código y fecha límite · vendedora avisada por correo y WhatsApp (wa.me)');

  // el comprador lo ve en Mis compras
  await page.goto(APP + '/app/compras/' + pagoId);
  await page.waitForSelector('[data-testid=estado-pago]:has-text("Pago confirmado")');
  if (!/en camino a la tienda/.test(await page.textContent('[data-testid=orden]')) || !/hasta el \d{2}\/\d{2}\/\d{4}/.test(await page.textContent('[data-testid=orden]'))) throw new Error('la orden no muestra el estado y la fecha límite');
  await page.goto(APP + '/app/compras');
  await page.waitForSelector('[data-testid=fila-compra] .paso-av.actual:has-text("Pagado")');
  await page.goto(APP + '/app/notificaciones');
  await page.waitForSelector('[data-testid=notificacion]:has-text("Pago confirmado")');
  await page.waitForFunction(() => !document.querySelector('[data-testid=chip-notificaciones] .cuenta'), null, { timeout: 15000 });
  await foto(page, 'notificaciones');
  log('comprador: Mis compras y notificaciones al día (leídas al abrir la bandeja)');

  // verificación del celular por WhatsApp (gratis): código → el administrador la confirma
  await page.goto(APP + '/app/ajustes');
  await page.waitForSelector('[data-testid=btn-verificar-wsp]');
  await page.click('[data-testid=btn-verificar-wsp]');
  await page.waitForSelector('[data-testid=codigo-verificacion]');
  const codigo = (await page.textContent('[data-testid=codigo-verificacion]')).trim();
  if (!/^\d{6}$/.test(codigo) || sql("select codigo_verificacion from public.perfiles where username = 'chris_tcg'") !== codigo) throw new Error('código de verificación inesperado: ' + codigo);
  await page.goto(APP + '/admin?tab=verificaciones');
  await page.waitForSelector(`[data-testid=admin-verificacion]:has-text("${codigo}")`);
  await page.click(`[data-testid=admin-verificacion]:has-text("${codigo}") [data-testid=btn-verificar]`);
  await page.waitForSelector('.toast:has-text("Celular verificado")');
  if (!sql("select celular_verificado_en from public.perfiles where username = 'chris_tcg'")) throw new Error('el celular no quedó verificado');
  await page.goto(APP + '/app/ajustes');
  await page.waitForSelector('[data-testid=verificacion-celular]:has-text("verificado")');
  log('celular verificado por WhatsApp: código', codigo, '→ confirmado en /admin');

  // ---------- Fase 3 · B: vendedora (fecha de entrega, datos de cobro), cuenta de tienda (recibido / retirado con código), entrega y carta a la colección
  sql(`update auth.users set encrypted_password = 'clave-lucia', email_confirmed_at = now() where id = '${LUCIA}'`);
  const TIENDA_USR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  sql(`insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values ('${TIENDA_USR}', 'tienda@correo.pe', 'clave-tienda', now(), '{\"username\":\"tienda_lince\",\"nombres\":\"Tienda\",\"apellidos\":\"Lince\",\"telefono\":\"955555555\",\"dni\":\"55555555\",\"acepto_terminos\":true}')`);
  const entrar = async (pg, usuario, clave) => { await pg.goto(APP + '/ingresar'); await pg.fill('input[autocomplete=username]', usuario); await pg.fill('input[type=password]', clave); await pg.click('button[type=submit]'); await pg.waitForURL(/\/app/, { timeout: 20000 }); await pg.waitForSelector('text=/Mis álbumes|precio estimado|colección está vacía/', { timeout: 60000 }); };
  const ctxL = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
  const pageL = await ctxL.newPage();
  await entrar(pageL, 'vendedora_lima', 'clave-lucia');
  // la vendedora ve su orden con la ubicación de las cartas y elige la fecha de entrega (último día = sábado límite)
  await pageL.goto(APP + '/app/ventas');
  await pageL.click('[data-testid=btn-ordenes-venta]');
  await pageL.waitForSelector('[data-testid=fila-orden-venta]');
  await pageL.click('[data-testid=fila-orden-venta] >> nth=0');
  await pageL.waitForSelector('[data-testid=entrega-vendedor]');
  if (!/estaba en.*Bulk Lucía.*#\d de 3/.test(await pageL.textContent('[data-testid=item-venta] >> nth=0'))) throw new Error('la orden no muestra dónde estaba la carta en la colección de la vendedora: ' + await pageL.textContent('[data-testid=item-venta] >> nth=0'));
  if (!(await pageL.$('[data-testid=btn-foto-entrega]'))) throw new Error('sin cuenta de tienda, la vendedora debía poder subir la foto de la entrega');
  const opciones = await pageL.$$eval('[data-testid=select-fecha] option', els => els.map(o => o.value));
  await pageL.selectOption('[data-testid=select-fecha]', opciones[opciones.length - 1]);
  await pageL.click('[data-testid=btn-fecha]');
  await pageL.waitForSelector('.toast:has-text("Fecha de entrega guardada")');
  const ordenId = pageL.url().split('/').pop();
  if (sql(`select fecha_entrega::text = fecha_limite::text from public.ordenes where id = '${ordenId}'`) !== 't') throw new Error('la fecha de entrega no se guardó');
  // Fase 4 · D: rótulo del sobre (imprimible / copiable) con orden, tienda, usuarios y cartas
  await pageL.click('[data-testid=btn-rotulo]');
  await pageL.waitForSelector('[data-testid=rotulo]');
  const textoRotulo = await pageL.textContent('[data-testid=rotulo]');
  for (const esperado of [`ORDEN #${sql(`select numero from public.ordenes where id = '${ordenId}'`)}`, 'Tienda E2E', '@vendedora_lima', '@chris_tcg', '3× Bulbasaur', 'código de retiro']) if (!textoRotulo.includes(esperado)) throw new Error('el rótulo no incluye «' + esperado + '»: ' + textoRotulo);
  await foto(pageL, 'vendedora-rotulo');
  await pageL.click('.sheet-foot >> text=Cerrar');
  await pageL.waitForSelector('[data-testid=rotulo]', { state: 'detached' });
  await foto(pageL, 'vendedora-orden');
  // datos de cobro (cifrados en el servidor)
  await pageL.goto(APP + '/app/ajustes');
  await pageL.click('[data-testid=btn-datos-cobro]');
  await pageL.fill('[data-testid=datos-cobro] input.input >> nth=0', 'Lucía Torres');
  await pageL.fill('[data-testid=datos-cobro] input.input >> nth=1', '912345678');
  await pageL.click('[data-testid=btn-guardar-cobro]');
  await pageL.waitForSelector('.toast:has-text("Datos de cobro guardados")');
  await pageL.waitForSelector('[data-testid=datos-cobro]:has-text("•••••5678")');
  if (/912345678/.test(sql(`select cifrado from public.datos_cobro where usuario_id = '${LUCIA}'`))) throw new Error('los datos de cobro no están cifrados');
  log('vendedora: orden con ubicación (Bulk Lucía), fecha de entrega = sábado límite, datos de cobro (Yape) cifrados');

  // el administrador asigna la cuenta de tienda → la vendedora ya no sube foto; la tienda marca "recibido"
  await page.goto(APP + '/admin?tab=tiendas');
  await page.waitForSelector('[data-testid=admin-tienda]:has-text("Tienda E2E")');
  await page.click('[data-testid=admin-tienda]:has-text("Tienda E2E") >> text=asignar cuenta');
  await page.fill('.sheet input.input', 'tienda_lince');
  await page.click('.sheet-foot >> text=Asignar');
  await page.waitForSelector('.toast:has-text("atiende Tienda E2E")');
  if (sql(`select rol from public.perfiles where id = '${TIENDA_USR}'`) !== 'tienda') throw new Error('la cuenta de tienda no recibió el rol');
  await pageL.goto(APP + '/app/ventas/ordenes/' + ordenId);
  await pageL.waitForSelector('[data-testid=entrega-vendedor]');
  if (await pageL.$('[data-testid=btn-foto-entrega]')) throw new Error('con cuenta de tienda, la vendedora no debe subir la foto');
  const ctxT = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
  const pageT = await ctxT.newPage();
  await entrar(pageT, 'tienda_lince', 'clave-tienda');
  await pageT.goto(APP + '/app/tienda');
  await pageT.waitForSelector('[data-testid=orden-tienda]:has-text("vendedora_lima")'); // los nombres de usuario cargan después de las órdenes
  if (/987654321|912345678/.test(await pageT.textContent('body'))) throw new Error('la tienda debe ver la orden sin celulares');
  await pageT.click('[data-testid=btn-recibido]');
  await pageT.click('[data-testid=btn-recibido-sin-foto]');
  await pageT.waitForSelector('.toast:has-text("recibida")');
  if (sql(`select estado from public.ordenes where id = '${ordenId}'`) !== 'en_tienda') throw new Error('la orden no quedó en tienda');
  const codigoRetiro = sql(`select codigo_retiro from public.ordenes where id = '${ordenId}'`);
  await foto(pageT, 'tienda-recibido');
  // el comprador ve su código de retiro y recibió el aviso (correo + WhatsApp pendiente)
  await page.goto(APP + '/app/compras/' + pagoId);
  await page.waitForSelector('[data-testid=codigo-retiro]');
  if ((await page.textContent('[data-testid=codigo-retiro]')).trim() !== codigoRetiro) throw new Error('el código de retiro no coincide');
  if (!(await correos()).some(c => /ya está en la tienda/.test(c.subject))) throw new Error('el comprador no recibió el correo "en tienda"');
  await foto(page, 'compra-en-tienda');
  log('tienda: cuenta asignada, orden recibida; el comprador ve su código', codigoRetiro);

  // retiro: código incorrecto → error; correcto → entregada; las copias salen de la colección de la vendedora (publicaciones vendidas)
  await pageT.reload();
  await pageT.waitForSelector('[data-testid=btn-retirado]');
  await pageT.click('[data-testid=btn-retirado]');
  await pageT.fill('[data-testid=input-codigo-retiro]', codigoRetiro === '000000' ? '111111' : '000000');
  await pageT.click('[data-testid=btn-confirmar-retiro]');
  await pageT.waitForSelector('.toast:has-text("no coincide")');
  await pageT.fill('[data-testid=input-codigo-retiro]', codigoRetiro);
  await pageT.click('[data-testid=btn-confirmar-retiro]');
  await pageT.waitForSelector('.toast:has-text("entregada")');
  // con liberacion_dias = 0 el saldo se libera al instante: entregada → saldo_liberado en la misma llamada
  if (sql(`select estado || ':' || entregada_por from public.ordenes where id = '${ordenId}'`) !== 'saldo_liberado:tienda') throw new Error('la orden no quedó entregada por la tienda (con saldo liberado)');
  if (num(`select count(*) from public.entradas where usuario_id = '${LUCIA}'`) !== 0) throw new Error('las cartas vendidas siguen en la colección de la vendedora');
  if (num(`select count(*) from public.publicaciones where usuario_id = '${LUCIA}' and estado = 'vendida'`) !== 3 || num(`select count(*) from public.mercado where vendedor_id = '${LUCIA}'`) !== 0) throw new Error('las publicaciones no quedaron vendidas');
  if (!/118\.61/.test(sql(`select cuerpo from public.notificaciones where usuario_id = '${LUCIA}' and tipo = 'entregada' order by id desc limit 1`))) throw new Error('la vendedora no recibió el aviso de entrega con su ganancia');
  await pageL.goto(APP + '/app/ventas/ordenes/' + ordenId);
  await pageL.waitForSelector('[data-testid=estado-orden-venta]:has-text("Entregada")');
  log('retiro con código: entregada por la tienda; 3 publicaciones vendidas, colección de la vendedora descontada, ganancia S/ 118.61 avisada');

  // las cartas compradas entraron solas a la colección del comprador, sin caja ("por colocar"), con idioma, acabado y estado de la compra
  const CHRIS = sql(`select id from public.perfiles where username = 'chris_tcg'`);
  if (sql(`select string_agg(carta_id || ':' || cantidad || ':' || idioma || ':' || acabado || ':' || condicion || ':' || coalesce(caja_id::text, 'sin caja'), ' | ' order by carta_id) from public.entradas where usuario_id = '${CHRIS}' and compra_orden_id = '${ordenId}'`) !== 'sv03.5-001:3:ES:Normal:MP:sin caja | sv03.5-004:1:EN:Reverse::sin caja | sv03.5-010:2:ES:::sin caja') throw new Error('las cartas compradas no entraron a la colección del comprador como "por colocar": ' + sql(`select string_agg(carta_id || ':' || cantidad || ':' || coalesce(caja_id::text, 'sin caja'), ' | ') from public.entradas where usuario_id = '${CHRIS}' and compra_orden_id = '${ordenId}'`));
  await page.goto(APP + '/app/compras/' + pagoId);
  await page.waitForSelector('[data-testid=orden-entregada]');
  if ((await page.$$('[data-testid=en-mi-coleccion]')).length !== 3) throw new Error('la compra no marca las cartas como "en tu colección"');
  // Mejoras 1 · C2/C3: Álbumes → "Recibidas: ¿dónde las guardas?" con sugerencia; Charmander (EN) va al álbum 151 EN con un toque
  await page.goto(APP + '/app/album');
  await page.waitForSelector('[data-testid=recibidas]:has-text("(6)")');
  if ((await page.$$('[data-testid=carta-recibida]')).length !== 3) throw new Error('"Recibidas" debía listar las 3 cartas compradas');
  const sugCharmander = await page.textContent('[data-testid=carta-recibida]:has-text("Charmander") [data-testid=sugerencia]');
  if (!/Sugerido.*Álbum 151 EN · casilla 004/.test(sugCharmander) || !/Porque coleccionas 151 en inglés/.test(sugCharmander)) throw new Error('sugerencia inesperada para Charmander: ' + sugCharmander);
  const sugBulbasaur = await page.textContent('[data-testid=carta-recibida]:has-text("Bulbasaur") [data-testid=sugerencia]');
  if (!/Crear álbum de 151 en ES · casilla 001/.test(sugBulbasaur) || !/Tienes 151 en inglés, pero esta carta es en español/.test(sugBulbasaur)) throw new Error('la carta en español debía sugerir crear el álbum 151 ES: ' + sugBulbasaur);
  await foto(page, 'recibidas');
  await page.click('[data-testid=carta-recibida]:has-text("Charmander") [data-testid=btn-recibida-guardar]');
  await page.waitForSelector('.sheet [data-testid=sugerencia-hoja]:has-text("casilla 004 (está vacía)")');
  await page.click('.sheet [data-testid=btn-guardar-sugerido]');
  await page.waitForSelector('[data-testid=colocacion] .placement .where:has-text("Álbum 151 EN · casilla 004")');
  await page.click('[data-testid=btn-guardada-listo]');
  await page.waitForSelector('[data-testid=recibidas]:has-text("(5)")');
  if (sql(`select album_coleccion || ':' || coalesce(caja_id::text, 'sin bulk') from public.entradas where usuario_id = '${CHRIS}' and carta_id = 'sv03.5-004' and compra_orden_id = '${ordenId}'`) !== 'sv03.5:sin bulk') throw new Error('Charmander no quedó en el álbum por colección');
  // la ubicación en el álbum se ve en Buscar y en el álbum de la colección
  await page.goto(APP + '/app/buscar');
  await page.fill('.search-wrap input', 'charmander 151');
  await page.waitForSelector('.card-row:has-text("004/165") .loc.album:has-text("MEW EN")');
  // "Elegir otro álbum" → Bulk 2 a mano para Caterpie
  await page.goto(APP + '/app/album');
  await page.click('[data-testid=carta-recibida]:has-text("Caterpie") [data-testid=btn-recibida-guardar]');
  await page.waitForSelector('.sheet [data-testid=btn-decidir-despues]');
  await page.click('.sheet [data-testid=btn-elegir-album]');
  await page.click('[data-testid=destino-bulk]:has-text("Bulk 2")');
  await page.waitForSelector('[data-testid=colocacion] .placement .where:has-text("Bulk 2")');
  await page.click('[data-testid=btn-guardada-listo]');
  await page.waitForSelector('[data-testid=recibidas]:has-text("(3)")');
  log('Álbumes → Recibidas: sugerencias con motivo (151 EN para Charmander; crear 151 ES para Bulbasaur ES); Charmander al álbum con un toque, Caterpie a Bulk 2 a mano');

  // ---------- Mejoras 2 · B: el álbum es lo principal; el Bulk guarda las repetidas
  // 1) Bulbasaur ES ×3 recibida → álbum 151 ES (ya existe: Caterpie ES acaba de entrar a Bulk 2): 1 copia a la casilla 001 y las otras 2 al Bulk como repetidas
  await page.click('[data-testid=carta-recibida]:has-text("Bulbasaur") [data-testid=btn-recibida-guardar]');
  await page.waitForSelector('.sheet [data-testid=sugerencia-hoja]:has-text("Álbum 151 ES")');
  const avisoCopias = await page.textContent('.sheet [data-testid=aviso-copias-album]');
  if (!/las otras 2 van a Bulk \d como repetidas \(posición #\d+\)/.test(avisoCopias)) throw new Error('aviso de copias inesperado: ' + avisoCopias);
  await page.click('.sheet [data-testid=btn-guardar-sugerido]');
  await page.waitForSelector('[data-testid=colocacion] .placement .where:has-text("Álbum 151 ES · casilla 001")');
  await page.waitForSelector('[data-testid=repetidas-guardadas]:has-text("Las otras 2 copias fueron a Bulk")');
  await page.click('[data-testid=btn-guardada-listo]');
  const bulbES = sql(`select string_agg(e.cantidad || ':' || coalesce(e.album_coleccion, '-') || ':' || coalesce(c.nombre, '-'), ' | ' order by e.cantidad) from public.entradas e left join public.cajas c on c.id = e.caja_id where e.usuario_id = '${CHRIS}' and e.carta_id = 'sv03.5-001' and e.idioma = 'ES'`);
  if (!/^1:sv03\.5:- \| 2:-:Bulk \d$/.test(bulbES)) throw new Error('la carta recibida con 3 copias no se repartió (1 al álbum + 2 al Bulk): ' + bulbES);
  // 2) otra Charmander EN desde Buscar → "Repetida · Mandar a Bulk": la casilla 004 ya está ocupada
  await page.goto(APP + '/app/buscar');
  await page.fill('.search-wrap input', 'charmander 151');
  await page.waitForSelector('.card-row');
  await page.locator('.card-row', { hasText: '004/165' }).first().locator('[data-testid=btn-guardar-fila]').click();
  await page.waitForSelector('.sheet [data-testid=sugerencia-guardar]');
  const sugRep = await page.textContent('.sheet [data-testid=sugerencia-guardar]');
  if (!/Repetida.*Mandar a Bulk \d · posición #\d+/.test(sugRep) || !/Ya tienes esta carta en la casilla 004 del álbum 151 EN: una casilla guarda 1 copia/.test(sugRep)) throw new Error('la repetida no sugiere el Bulk: ' + sugRep);
  if (!(await page.$('.sheet [data-testid=destino-coleccion][disabled]:has-text("casilla ocupada")'))) throw new Error('la casilla ocupada debía estar deshabilitada en la hoja');
  await page.click('.sheet [data-testid=btn-usar-sugerencia]');
  await page.click('.sheet-foot >> text=Guardar');
  await page.waitForSelector('.placement .where:has-text("Bulk")');
  await page.click('.sheet-foot >> text=Listo');
  // 3) Ordenar repetidas: la casilla 004 (Reverse) con 5 copias → aviso en Álbumes → Bulk 2 → 4 copias salen con su posición
  sql(`update public.entradas set cantidad = 5 where usuario_id = '${CHRIS}' and carta_id = 'sv03.5-004' and album_coleccion = 'sv03.5'`);
  await page.goto(APP + '/app/album');
  await page.waitForSelector('[data-testid=aviso-repetidas]:has-text("Tienes 4 cartas repetidas en tus álbumes")');
  await foto(page, 'aviso-repetidas');
  await page.click('[data-testid=btn-ordenar-repetidas]');
  await page.click('.sheet [data-testid=ordenar-bulk-opcion]:has-text("Bulk 2")');
  await page.click('.sheet [data-testid=btn-ordenar-continuar]');
  await page.waitForSelector('.sheet [data-testid=resumen-repetidas]');
  const resumenRep = await page.textContent('.sheet [data-testid=resumen-repetidas]');
  if (!/Copias que salen de los álbumes4/.test(resumenRep) || !/Van aBulk 2/.test(resumenRep) || !/Posiciones#\d+/.test(resumenRep)) throw new Error('resumen de repetidas inesperado: ' + resumenRep);
  if ((await page.$$('.sheet [data-testid=fila-repetida]')).length !== 1 || !/4 de 5: 1 se queda en la casilla/.test(await page.textContent('.sheet [data-testid=fila-repetida]'))) throw new Error('la lista de repetidas debía tener solo a Charmander (4 de 5)');
  await foto(page, 'ordenar-repetidas');
  await page.click('.sheet [data-testid=btn-ordenar-confirmar]');
  await page.waitForSelector('[data-testid=aviso-repetidas]', { state: 'detached' });
  if (sql(`select cantidad from public.entradas where usuario_id = '${CHRIS}' and carta_id = 'sv03.5-004' and album_coleccion = 'sv03.5'`) !== '1') throw new Error('la casilla 004 debía quedar con 1 copia');
  if (sql(`select e.cantidad || ':' || e.acabado || ':' || e.posicion from public.entradas e join public.cajas c on c.id = e.caja_id where e.usuario_id = '${CHRIS}' and e.carta_id = 'sv03.5-004' and c.nombre = 'Bulk 2' and e.acabado = 'Reverse'`) !== '4:Reverse:' + sql(`select max(posicion) from public.entradas e join public.cajas c on c.id = e.caja_id where e.usuario_id = '${CHRIS}' and c.nombre = 'Bulk 2'`)) throw new Error('las 4 repetidas no llegaron a Bulk 2 con la última posición');
  // 4) Llenar álbumes desde Bulk: Pikachu (sin idioma) está en Bulk 1 y la casilla 025 del álbum 151 "sin idioma" está vacía
  await page.waitForSelector('[data-testid=aviso-llenar]');
  await page.click('[data-testid=btn-llenar-albumes]');
  await page.waitForSelector('.sheet [data-testid=llenar-fila]');
  const filasLlenar = await page.$$('.sheet [data-testid=llenar-fila]');
  for (const f of filasLlenar) { const t = await f.textContent(); if (!/Pikachu/.test(t) || !/Bulk 1 → casilla 025/.test(t)) await (await f.$('input')).click(); }
  const marcadas = await page.$$eval('.sheet [data-testid=llenar-fila] input:checked', els => els.length);
  if (marcadas !== 1) throw new Error('debía quedar marcada solo Pikachu, hay ' + marcadas);
  await foto(page, 'llenar-albumes');
  await page.click('.sheet [data-testid=btn-llenar-confirmar]:has-text("Mover 1 a sus álbumes")');
  await page.waitForSelector('.sheet [data-testid=btn-llenar-confirmar]', { state: 'detached' });
  if (sql(`select string_agg(e.cantidad || ':' || coalesce(e.album_coleccion, '-') || ':' || coalesce(c.nombre, '-'), ' | ' order by e.album_coleccion nulls last) from public.entradas e left join public.cajas c on c.id = e.caja_id where e.usuario_id = '${CHRIS}' and e.carta_id = 'sv03.5-025' and coalesce(nullif(e.idioma, ''), 'EN') = 'EN'`) !== '1:sv03.5:- | 1:-:Bulk 1') throw new Error('Pikachu EN no pasó del Bulk al álbum (la otra copia, Reverse, sigue en Bulk 1): ' + sql(`select string_agg(e.cantidad || ':' || coalesce(e.album_coleccion, '-') || ':' || coalesce(e.caja_id::text, '-'), ' | ') from public.entradas e where e.usuario_id = '${CHRIS}' and e.carta_id = 'sv03.5-025'`));
  // la hoja del álbum "sin idioma": la casilla 025 muestra la copia sin "×"; en el álbum EN la 004 muestra "+N" (copias en Bulk)
  await page.goto(APP + '/app/album/sv03.5?idioma=' + encodeURIComponent('—'));
  await page.click('[data-testid=filtro-album] >> text=Tengo');
  await page.waitForSelector('[data-testid=casilla-tengo]:has-text("025")');
  if (await page.$('[data-testid=casilla-tengo]:has-text("025") .casilla-cant.repetida')) throw new Error('la casilla 025 no debía mostrar repetidas');
  if ((await page.textContent('[data-testid=casilla-tengo]:has-text("025") .casilla-cant.bulk')) !== '+1') throw new Error('la casilla 025 debía mostrar "+1" (la copia Reverse sigue en Bulk 1)');
  await page.goto(APP + '/app/album/sv03.5?idioma=EN');
  await page.waitForSelector('[data-testid=casilla-tengo]:has-text("004")');
  const cant004 = await page.textContent('[data-testid=casilla-tengo]:has-text("004") .casilla-cant.bulk');
  if (!/^\+\d+$/.test(cant004)) throw new Error('la casilla 004 debía mostrar "+N" (copias en Bulk): ' + cant004);
  log('Mejoras 2 · B: recibida ×3 → 1 a la casilla y 2 al Bulk; repetida sugiere "Mandar a Bulk"; "Ordenar repetidas" saca 4 copias a Bulk 2 con posición; "Llenar álbumes" lleva Pikachu del Bulk a la casilla 025');

  // ---------- Mejoras 2 · C: poner en venta un álbum eligiendo con qué me quedo
  // Álbum 151 ES: Bulbasaur 5 en la casilla + 2 en Bulk 2 (7 copias) y Caterpie ×2 en Bulk 2
  sql(`update public.entradas set cantidad = 5 where usuario_id = '${CHRIS}' and carta_id = 'sv03.5-001' and album_coleccion = 'sv03.5' and idioma = 'ES'`);
  await page.goto(APP + '/app/album/sv03.5?idioma=ES');
  await page.waitForSelector('[data-testid=btn-acciones]');
  await page.click('[data-testid=btn-acciones]');
  await page.waitForSelector('[data-testid=btn-poner-en-venta]:has-text("(3)")');
  await page.click('[data-testid=btn-poner-en-venta]');
  await page.waitForSelector('.sheet [data-testid=resumen-venta-album]');
  const textoResumen = async () => (await page.textContent('.sheet [data-testid=resumen-venta-album]')).replace(/\s+/g, ' ');
  // 1 de cada (por defecto): de 7 Bulbasaur se queda 1 y salen 6; de 2 Caterpie se queda 1 y sale 1
  let res = await textoResumen();
  if (!/Se publican7 copias \(2 cartas\)/.test(res) || !/Te quedas con2 copias \(2 cartas\)/.test(res)) throw new Error('resumen "1 de cada" inesperado: ' + res);
  // + las de mayor precio: límite S/ 16 → Caterpie (S/ 19.17) se queda completo; no se publica ninguna de más de S/ 16; Bulbasaur (S/ 15.06) sigue con "1 de cada"
  await page.click('.sheet [data-testid=opcion-mayor-precio] input');
  await page.fill('.sheet [data-testid=input-limite]', '16');
  res = await textoResumen();
  if (!/Se publican6 copias \(1 carta\)/.test(res) || !/Te quedas con3 copias \(2 cartas\)/.test(res)) throw new Error('resumen "mayor precio" inesperado: ' + res);
  if (!/1 carta se queda/.test(await page.textContent('.sheet [data-testid=detalle-mayor-precio]'))) throw new Error('el detalle del límite no cuenta la carta que se queda');
  // elegir una por una: la lista viene marcada según las reglas
  await page.click('.sheet [data-testid=opcion-una-por-una] input');
  await page.waitForSelector('.sheet [data-testid=lista-una-por-una]');
  if (!/Se queda \(mayor precio\)/.test(await page.textContent('.sheet [data-testid=fila-venta-carta]:has-text("Caterpie")'))) throw new Error('Caterpie debía figurar como "se queda (mayor precio)"');
  if (!/Se publican 6 · se queda 1/.test(await page.textContent('.sheet [data-testid=fila-venta-carta]:has-text("Bulbasaur")'))) throw new Error('Bulbasaur debía figurar como "se publican 6 · se queda 1"');
  await foto(page, 'venta-album');
  // vender todo → 9 copias; vuelta a las reglas y confirmar con "1 de cada" (7 copias)
  await page.click('.sheet [data-testid=opcion-vender-todo] input');
  res = await textoResumen();
  if (!/Se publican9 copias \(2 cartas\)/.test(res) || !/Te quedas con0 copias/.test(res)) throw new Error('resumen "vender todo" inesperado: ' + res);
  await page.click('.sheet [data-testid=opcion-vender-todo] input');
  await page.click('.sheet [data-testid=opcion-mayor-precio] input');
  res = await textoResumen();
  if (!/Se publican7 copias \(2 cartas\)/.test(res)) throw new Error('resumen tras volver a "1 de cada" inesperado: ' + res);
  await page.click('.sheet [data-testid=btn-confirmar-venta-album]:has-text("Publicar 7 copias")');
  await page.waitForSelector('.toast:has-text("7 copias publicadas")');
  const pubsES = sql(`select string_agg(coalesce(c.nombre, 'Álbum') || ':' || e.carta_id || ':' || e.cantidad || '→' || p.cantidad || ':' || p.estado, ' | ' order by e.carta_id, e.cantidad) from public.publicaciones p join public.entradas e on e.id = p.entrada_id left join public.cajas c on c.id = e.caja_id where p.usuario_id = '${CHRIS}' and e.idioma = 'ES' and p.estado in ('activa', 'pausada')`);
  if (pubsES !== 'Bulk 2:sv03.5-001:2→2:activa | Álbum:sv03.5-001:5→4:activa | Bulk 2:sv03.5-010:2→1:activa') throw new Error('publicaciones del álbum ES inesperadas: ' + pubsES);
  // la casilla 001 muestra "4 para vender" (en el álbum, para vender) y la ficha de la carta lo dice
  await page.waitForSelector('[data-testid=casilla-tengo]:has-text("001") [data-testid=casilla-venta]:has-text("4")');
  await page.goto(APP + '/app/carta/sv03.5-001');
  await page.waitForSelector('.pill:has-text("4 para vender")');
  log('Mejoras 2 · C: Poner en venta el álbum 151 ES → "1 de cada" publica 7 de 9 copias (Bulbasaur 4 + 2, Caterpie 1); "más de S/ 10" deja Bulbasaur; "vender todo" 9; la casilla muestra "4 para vender"');

  // Bulk: ya no queda nada por colocar (Bulbasaur ×3 se repartió desde Recibidas: 1 al álbum 151 ES y 2 al Bulk como repetidas)
  await page.goto(APP + '/app/bulk');
  await page.waitForSelector('[data-testid=selector-bulk]');
  if (await page.$('[data-testid=por-colocar]')) throw new Error('no debía quedar nada por colocar');
  if (sql(`select string_agg(coalesce(c.nombre, 'Álbum ' || e.album_coleccion) || ':' || e.cantidad, ' | ' order by e.cantidad) from public.entradas e left join public.cajas c on c.id = e.caja_id where e.usuario_id = '${CHRIS}' and e.carta_id = 'sv03.5-001' and e.compra_orden_id = '${ordenId}'`) !== 'Bulk 2:2 | Álbum sv03.5:5') throw new Error('la carta comprada no quedó repartida (álbum —5 tras la prueba de venta— + 2 en Bulk 2): ' + sql(`select string_agg(coalesce(c.nombre, 'Álbum') || ':' || e.cantidad, ' | ') from public.entradas e left join public.cajas c on c.id = e.caja_id where e.usuario_id = '${CHRIS}' and e.carta_id = 'sv03.5-001'`));
  await ctxL.close(); await ctxT.close();
  log('comprador: 3 cartas compradas (6 copias) entraron solas "por colocar"; Bulbasaur ×3 repartido desde Recibidas: 1 al álbum 151 ES y 2 a Bulk 2 como repetidas');

  // ---------- Fase 4 · A: reputación (calificación, perfil público, respuesta del vendedor, suspensión)
  await page.goto(APP + '/app/compras/' + pagoId);
  await page.waitForSelector('[data-testid=btn-calificar]');
  await page.click('[data-testid=btn-calificar]');
  await page.waitForSelector('[data-testid=estrella-5]');
  await page.click('[data-testid=estrella-5]');
  await page.fill('[data-testid=input-comentario]', 'Cartas impecables y entrega puntual.');
  await page.click('[data-testid=btn-enviar-calificacion]');
  await page.waitForSelector('.toast:has-text("Gracias")');
  await page.waitForSelector('[data-testid=mi-resena]:has-text("impecables")');
  if (sql(`select puntaje || ':' || comentario from public.resenas where orden_id = '${ordenId}'`) !== '5:Cartas impecables y entrega puntual.') throw new Error('la reseña no se guardó');
  if (sql(`select reputacion->>'puntaje' || ':' || (reputacion->>'ventas') || ':' || (reputacion->'insignias')::text from public.perfiles where id = '${LUCIA}'`) !== '5.00:1:["nuevo"]') throw new Error('la reputación de la vendedora no se calculó: ' + sql(`select reputacion::text from public.perfiles where id = '${LUCIA}'`));
  if (!sql(`select titulo from public.notificaciones where usuario_id = '${LUCIA}' and tipo = 'resena' order by id desc limit 1`).includes('★★★★★')) throw new Error('la vendedora no recibió el aviso de la reseña');
  await foto(page, 'calificacion');
  // perfil público sin iniciar sesión
  const ctxAnon = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
  const pageAnon = await ctxAnon.newPage();
  await pageAnon.goto(APP + '/u/vendedora_lima');
  await pageAnon.waitForSelector('[data-testid=perfil-publico]');
  if ((await pageAnon.textContent('[data-testid=perfil-puntaje]')) !== '5.0' || (await pageAnon.textContent('[data-testid=perfil-ventas]')) !== '1' || !(await pageAnon.$('[data-testid=insignia-nuevo]'))) throw new Error('el perfil público no muestra puntaje, ventas e insignia');
  if (!/@chris_tcg/.test(await pageAnon.textContent('[data-testid=resena-publica]')) || !/impecables/.test(await pageAnon.textContent('[data-testid=resena-publica]'))) throw new Error('la reseña no aparece en el perfil público');
  if (/9\d{8}|Lucía Torres|vendedora@correo/.test(await pageAnon.textContent('body'))) throw new Error('el perfil público expone datos personales');
  await foto(pageAnon, 'perfil-publico');
  // la vendedora ve su reputación y responde la reseña
  const ctxL3 = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
  const pageL3 = await ctxL3.newPage();
  await entrar(pageL3, 'vendedora_lima', 'clave-lucia');
  await pageL3.goto(APP + '/app/ventas');
  await pageL3.waitForSelector('[data-testid=mi-reputacion]:has-text("5.0")');
  await pageL3.click('[data-testid=mi-reputacion] >> text=Ver reseñas');
  await pageL3.waitForSelector('[data-testid=resena] [data-testid=btn-responder]');
  await pageL3.click('[data-testid=btn-responder]');
  await pageL3.fill('[data-testid=input-respuesta]', '¡Gracias por tu compra!');
  await pageL3.click('[data-testid=btn-enviar-respuesta]');
  await pageL3.waitForSelector('.toast:has-text("Respuesta publicada")');
  await pageAnon.reload();
  await pageAnon.waitForSelector('[data-testid=resena-publica]:has-text("Gracias por tu compra")');
  log('reputación: calificación ★5 con comentario, perfil público @vendedora_lima (5.0 · 1 venta · 🌱 nuevo, sin datos personales), respuesta de la vendedora');
  // el administrador suspende y reactiva a la vendedora
  await page.goto(APP + '/admin?tab=usuarios');
  await page.fill('[data-testid=buscar-usuario]', 'vendedora');
  await page.waitForSelector('[data-testid=admin-usuario]:has-text("@vendedora_lima")');
  await page.click('[data-testid=admin-usuario]:has-text("@vendedora_lima") [data-testid=btn-suspender]');
  await page.fill('[data-testid=input-motivo-suspension]', 'Prueba de suspensión');
  await page.click('[data-testid=btn-confirmar-suspension]');
  await page.waitForSelector('.toast:has-text("suspendido")');
  await page.waitForSelector('[data-testid=admin-usuario]:has-text("@vendedora_lima") [data-testid=pill-suspendido]');
  if (sql(`select estado || ':' || suspendido_motivo from public.perfiles where id = '${LUCIA}'`) !== 'suspendido:Prueba de suspensión') throw new Error('la suspensión no se guardó');
  await pageL3.goto(APP + '/app/buscar');
  await pageL3.waitForSelector('text=Tu cuenta está suspendida');
  await pageAnon.reload();
  await pageAnon.waitForSelector('[data-testid=pill-suspendido]');
  await page.click('[data-testid=admin-usuario]:has-text("@vendedora_lima") [data-testid=btn-reactivar]');
  await page.waitForSelector('.toast:has-text("reactivado")');
  if (sql(`select estado from public.perfiles where id = '${LUCIA}'`) !== 'activo') throw new Error('la reactivación no se guardó');
  await ctxAnon.close(); await ctxL3.close();
  log('admin: usuaria suspendida (aviso en su app y en su perfil público) y reactivada');

  // ---------- Fase 3 · C: saldo del vendedor, Excel del día de pago y pago marcado
  if (sql(`select estado || ':' || monto from public.retiros where usuario_id = '${LUCIA}'`) !== 'pendiente:118.61') throw new Error('la entrega no generó el pago pendiente: ' + sql(`select estado || ':' || monto from public.retiros where usuario_id = '${LUCIA}'`));
  const ctxL2 = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
  const pageL2 = await ctxL2.newPage();
  await entrar(pageL2, 'vendedora_lima', 'clave-lucia');
  await pageL2.goto(APP + '/app/ventas');
  await pageL2.waitForSelector('[data-testid=mi-saldo]');
  if (!/S\/ 118\.61/.test(await pageL2.textContent('[data-testid=mi-saldo]'))) throw new Error('Mi saldo no muestra la ganancia por pagar');
  await pageL2.click('[data-testid=mi-saldo] >> text=Ver movimientos');
  await pageL2.waitForSelector('[data-testid=retiro]:has-text("por pagar")');
  await foto(pageL2, 'mi-saldo');
  // Excel del día (descarga desde /admin) con la vendedora en la hoja Yape-Plin
  await page.goto(APP + '/admin?tab=retiros');
  await page.waitForSelector('[data-testid=admin-retiro]:has-text("@vendedora_lima")');
  if (!/Yape 912345678/.test(await page.textContent('[data-testid=admin-retiro]:has-text("@vendedora_lima")'))) throw new Error('el pago no muestra los datos de cobro descifrados');
  const xlsx = await page.request.get(APP + '/api/admin/retiros/excel');
  if (!xlsx.ok() || !/spreadsheetml/.test(xlsx.headers()['content-type'] || '')) throw new Error('no se pudo descargar el Excel: ' + xlsx.status());
  const ExcelJS = requireProyecto('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await xlsx.body());
  const hojaYape = wb.getWorksheet('Yape-Plin');
  const filaLucia = [];
  hojaYape.eachRow(r => { if (String(r.getCell(3).value) === '@vendedora_lima') filaLucia.push(r.values); });
  if (filaLucia.length !== 1 || filaLucia[0][8] !== '912345678' || Number(filaLucia[0][16]) !== 118.61 || !/#\d+/.test(String(filaLucia[0][13]))) throw new Error('fila del Excel inesperada: ' + JSON.stringify(filaLucia));
  if (!wb.getWorksheet('Resumen') || !wb.getWorksheet('Transferencia')) throw new Error('faltan hojas en el Excel');
  // la tarea diaria (todos los días son día de pago) envía el Excel por correo al administrador
  const tareaPago = await correrTarea();
  if (!tareaPago.tarea?.detalle?.pagos?.generado) throw new Error('la tarea diaria no generó el Excel: ' + JSON.stringify(tareaPago.tarea?.detalle?.pagos));
  const correoExcel = (await correos()).filter(c => /Pagos a vendedores/.test(c.subject)).pop();
  if (!correoExcel || !correoExcel.attachments?.length || !/pagos-poketcg-.*\.xlsx/.test(correoExcel.attachments[0].filename)) throw new Error('el correo del Excel no llegó con adjunto');
  log('pago pendiente S/ 118.61 (Yape 912345678) en Mi saldo, en /admin y en el Excel enviado por correo:', correoExcel.attachments[0].filename);

  // el administrador marca el pago → la vendedora recibe el aviso (correo + WhatsApp) y ve "ya pagado"
  await page.reload();
  await page.waitForSelector('[data-testid=admin-retiro]:has-text("@vendedora_lima") [data-testid=btn-pagado]');
  await page.click('[data-testid=admin-retiro]:has-text("@vendedora_lima") [data-testid=btn-pagado]');
  await page.waitForSelector('[data-testid=btn-confirmar-pagado]');
  await page.fill('[data-testid=input-operacion-pago]', 'YP-555');
  await page.setInputFiles('[data-testid=input-comprobante-pago]', '/tmp/foto-carta.png');   // captura del Yape (se comprime y se guarda en privado)
  await page.waitForSelector('.sheet img[alt="Comprobante"]');
  await foto(page, 'admin-pagar');
  await page.click('[data-testid=btn-confirmar-pagado]');
  await page.waitForSelector('.toast:has-text("vendedores avisados")');
  const retiroId = sql(`select id from public.retiros where usuario_id = '${LUCIA}'`);
  const retiroPagado = sql(`select estado || '|' || coalesce(n_operacion, '') || '|' || coalesce(comprobante_url, '') from public.retiros where id = '${retiroId}'`);
  if (retiroPagado !== `pagado|YP-555|${LUCIA}/pago-${retiroId}.jpg`) throw new Error('el pago no quedó marcado con operación y comprobante: ' + retiroPagado);
  if (!(await (await fetch(MOCK + '/__objetos')).json()).includes(`comprobantes/${LUCIA}/pago-${retiroId}.jpg`)) throw new Error('el comprobante del pago no se guardó en el bucket privado');
  const correoPago = (await correos()).find(c => /Te pagamos S\/ 118\.61/.test(c.subject));
  if (!correoPago || !/YP-555/.test(correoPago.html) || !/comprobante/.test(correoPago.html)) throw new Error('la vendedora no recibió el correo del pago con la operación y el comprobante');
  await page.click('[data-testid=admin-tabs] >> text=WhatsApp');
  await page.waitForSelector('[data-testid=admin-wsp]:has-text("Te pagamos")');
  await pageL2.goto(APP + '/app/ventas');
  await pageL2.waitForSelector('[data-testid=mi-saldo]');
  if (!/ya pagado/.test(await pageL2.textContent('[data-testid=mi-saldo]')) || !/S\/ 118\.61/.test(await pageL2.textContent('[data-testid=mi-saldo] .stat .box >> nth=2'))) throw new Error('Mi saldo no muestra el pago realizado');
  await pageL2.click('[data-testid=mi-saldo] >> text=Ver movimientos');
  await pageL2.waitForSelector('[data-testid=retiro]:has-text("pagado") [data-testid=btn-ver-comprobante]');
  // el comprobante se abre con una URL firmada (bucket privado): solo la vendedora y el administrador pueden verlo
  const [popup] = await Promise.all([ctxL2.waitForEvent('page'), pageL2.click('[data-testid=btn-ver-comprobante]')]);
  await popup.waitForLoadState();
  if (!/\/object\/sign\/comprobantes\//.test(popup.url())) throw new Error('el comprobante no se abrió con URL firmada: ' + popup.url());
  const imgResp = await ctxL2.request.get(popup.url());
  if (!imgResp.ok() || !/^image\//.test(imgResp.headers()['content-type'] || '')) throw new Error('el comprobante firmado no se puede descargar: ' + imgResp.status());
  await popup.close();
  const sesionTienda = await (await fetch(MOCK + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'tienda@correo.pe', password: 'clave-tienda' }) })).json();
  const ajeno = await fetch(`${MOCK}/storage/v1/object/sign/comprobantes/${LUCIA}/pago-${retiroId}.jpg`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + sesionTienda.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) });
  if (ajeno.status === 200) throw new Error('otro usuario pudo firmar el comprobante ajeno');
  await ctxL2.close();
  log('pago marcado (op. YP-555 + captura privada): vendedora avisada por correo y WhatsApp; Mi saldo → ya pagado S/ 118.61 con su comprobante; otro usuario no puede verlo');

  // ---------- Fase 3 · D: textos legales con las cifras vigentes (comisión, plazos, días de pago)
  await page.goto(APP + '/terminos');
  await page.waitForSelector('[data-testid=terminos]');
  const terminos = await page.textContent('[data-testid=terminos]');
  for (const frase of ['intermediario', 'comisión del 5 %', '30 minutos', '3 días', 'todos los días', 'código de retiro de 6 dígitos', '7 días después de confirmado el pago', '48 horas', 'anular la orden tú mismo', 'reclamo', 'Libro de Reclamaciones']) if (!terminos.includes(frase)) throw new Error('los términos no mencionan: ' + frase);
  await page.goto(APP + '/privacidad');
  await page.waitForSelector('[data-testid=privacidad]');
  const privacidad = await page.textContent('[data-testid=privacidad]');
  for (const frase of ['Ley N.º 29733', 'cifrados', 'nombre de usuario', 'Las tiendas aliadas', 'São Paulo']) if (!privacidad.includes(frase)) throw new Error('la política de privacidad no menciona: ' + frase);
  log('términos y política de privacidad con comisión 5 %, plazos y días de pago vigentes');

  // ---------- Fase 4 · B: anulación por el comprador, saldo del comprador, compra pagada con saldo, reclamo en tienda y retiro del saldo
  const rpcComo = (uid, consulta) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', '${uid}', true); ${consulta}; commit;`).split('\n').map(l => l.trim()).filter(Boolean).pop();
  const TIENDA_E2E = sql(`select id from public.tiendas where nombre = 'Tienda E2E'`);
  // la vendedora agrega dos cartas a su caja en venta (se publican solas) a S/ 10 cada una
  sql(`insert into public.entradas (usuario_id, caja_id, carta_id, cantidad, acabado, idioma, condicion) values ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-002', 1, 'Normal', 'ES', 'NM'), ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-003', 2, 'Normal', 'ES', 'NM')`);
  sql(`update public.publicaciones set tipo_precio = 'manual', precio_pen = 10 where usuario_id = '${LUCIA}' and carta_id in ('sv03.5-002', 'sv03.5-003') and estado = 'activa'`);
  const pub002 = sql(`select id from public.publicaciones where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-002' and estado = 'activa'`);
  const pub003 = sql(`select id from public.publicaciones where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-003' and estado = 'activa'`);
  if (!pub002 || !pub003) throw new Error('las cartas nuevas de la vendedora no se publicaron solas');
  // compra confirmada (RPC) cuyo vendedor no elige fecha en 48 h → el comprador anula desde la app y el dinero cae a su saldo
  if (!/"ok": true/.test(rpcComo(CHRIS, `select public.reservar_copia('${pub002}', 1)`))) throw new Error('no se pudo reservar la carta 002');
  const pagoB1 = JSON.parse(rpcComo(CHRIS, `select public.crear_pago('${TIENDA_E2E}', false)`));
  if (!pagoB1.ok) throw new Error('crear_pago B1: ' + JSON.stringify(pagoB1));
  if (!/"ok": true/.test(rpcComo(CHRIS, `select public.subir_comprobante('${pagoB1.pago_id}', 'comprobantes/x/b1.jpg', 'B1-0001')`))) throw new Error('comprobante B1');
  if (!/"ok": true/.test(rpcComo(CHRIS, `select public.revisar_pago('${pagoB1.pago_id}', 'confirmar', null)`))) throw new Error('confirmar B1');
  const ordenB1 = sql(`select id from public.ordenes where pago_id = '${pagoB1.pago_id}'`);
  if (sql(`select (fecha_limite = (pago_confirmado_en at time zone 'America/Lima')::date + 7)::text from public.ordenes where id = '${ordenB1}'`) !== 'true') throw new Error('la fecha límite no es 7 días después del pago');
  if (num(`select count(*) from public.entradas where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-002'`) !== 0) throw new Error('la copia vendida no salió de la colección de la vendedora');
  await page.goto(APP + '/app/compras/' + pagoB1.pago_id);
  await page.waitForSelector('[data-testid=orden]:has-text("48 h para elegir la fecha")');
  if (await page.$('[data-testid=btn-anular-orden]')) throw new Error('antes de las 48 h no debe poder anular');
  sql(`update public.ordenes set pago_confirmado_en = now() - interval '49 hours' where id = '${ordenB1}'`);
  await page.reload();
  await page.waitForSelector('[data-testid=btn-anular-orden]');
  await page.click('[data-testid=btn-anular-orden]');
  await page.click('.sheet-foot >> text=Anular y recuperar mi dinero');
  await page.waitForSelector('.toast:has-text("Orden anulada")');
  if (sql(`select estado || ':' || anulada_por || ':' || falta_vendedor from public.ordenes where id = '${ordenB1}'`) !== 'vencida:comprador:true') throw new Error('la anulación no quedó registrada');
  if (num(`select cantidad from public.entradas where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-002'`) !== 1 || sql(`select estado from public.publicaciones where id = '${pub002}'`) !== 'activa') throw new Error('la copia no volvió a la colección y al mercado de la vendedora');
  if (sql(`select public.saldo_de('${CHRIS}')`) !== '10.00') throw new Error('el dinero no volvió al saldo del comprador: ' + sql(`select public.saldo_de('${CHRIS}')`));
  if (sql(`select (reputacion->>'faltas')::int >= 1 from public.perfiles where id = '${LUCIA}'`) !== 't') throw new Error('la falta no se registró en la reputación');
  await page.goto(APP + '/app/compras');
  await page.waitForSelector('[data-testid=saldo-comprador]');
  if ((await page.textContent('[data-testid=saldo-monto]')).trim() !== 'S/ 10.00') throw new Error('Mis compras no muestra el saldo');
  await foto(page, 'saldo-comprador');
  log('anulación por el comprador (vendedora sin fecha en 48 h): orden vencida con falta, copia devuelta a la vendedora y S/ 10.00 en el saldo del comprador');

  // compra pagada con el saldo (cubre todo → confirmada al instante, sin comprobante)
  if (!/"ok": true/.test(rpcComo(CHRIS, `select public.reservar_copia('${pub003}', 1)`))) throw new Error('no se pudo reservar la carta 003');
  await page.goto(APP + '/app/carrito');
  await page.waitForSelector('[data-testid=usar-saldo] input:checked');
  if (!/tu saldo cubre todo/.test(await page.textContent('[data-testid=resumen-carrito]'))) throw new Error('el carrito no anuncia que el saldo cubre la compra');
  await page.click('[data-testid=tienda-opcion]:has-text("Tienda E2E")');
  await page.click('[data-testid=btn-comprar]');
  await page.waitForSelector('.toast:has-text("pagada con tu saldo")');
  await page.waitForURL(/\/app\/compras\//, { timeout: 20000 });
  const pagoB2 = page.url().split('/').pop();
  await page.waitForSelector('[data-testid=estado-pago]:has-text("Pago confirmado")');
  if (sql(`select estado || ':' || n_operacion || ':' || monto_saldo || ':' || monto_yape from public.pagos where id = '${pagoB2}'`) !== 'confirmado:SALDO:10.00:0.00') throw new Error('el pago con saldo no quedó confirmado: ' + sql(`select estado || ':' || coalesce(n_operacion, '') || ':' || monto_saldo || ':' || monto_yape from public.pagos where id = '${pagoB2}'`));
  if (sql(`select public.saldo_de('${CHRIS}')`) !== '0.00') throw new Error('el saldo no se descontó');
  const ordenB2 = sql(`select id from public.ordenes where pago_id = '${pagoB2}'`);
  log('compra pagada con el saldo: confirmada al instante (sin comprobante), saldo en S/ 0.00');

  // reclamo en tienda: la vendedora entrega, la tienda la recibe, el comprador reclama con foto; el administrador devuelve
  if (!/"ok": true/.test(rpcComo(LUCIA, `select public.elegir_fecha_entrega('${ordenB2}', (select fecha_limite from public.ordenes where id = '${ordenB2}'))`))) throw new Error('fecha B2');
  if (!/"ok": true/.test(rpcComo(TIENDA_USR, `select public.marcar_en_tienda('${ordenB2}', null)`))) throw new Error('en tienda B2');
  await page.goto(APP + '/app/compras/' + pagoB2);
  await page.waitForSelector('[data-testid=btn-reclamar]');
  await page.click('[data-testid=btn-reclamar]');
  await page.selectOption('[data-testid=select-motivo-reclamo]', 'carta_distinta');
  await page.fill('[data-testid=input-detalle-reclamo]', 'La carta del sobre es otra edición');
  await page.setInputFiles('[data-testid=input-foto-reclamo]', '/tmp/foto-carta.png');
  await page.click('[data-testid=btn-enviar-reclamo]');
  await page.waitForSelector('.toast:has-text("Reclamo #")');
  await page.waitForSelector('[data-testid=orden-disputa]');
  const reclamoId = sql(`select id from public.reclamos where orden_id = '${ordenB2}'`);
  if (sql(`select estado from public.ordenes where id = '${ordenB2}'`) !== 'disputa' || !/reclamo-/.test(sql(`select fotos[1] from public.reclamos where id = '${reclamoId}'`))) throw new Error('el reclamo no quedó registrado con su foto');
  if (!(await (await fetch(MOCK + '/__objetos')).json()).some(o => o.startsWith(`comprobantes/${CHRIS}/reclamo-`))) throw new Error('la foto del reclamo no se guardó en el bucket privado');
  const ctxT2 = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
  const pageT2 = await ctxT2.newPage();
  await entrar(pageT2, 'tienda_lince', 'clave-tienda');
  await pageT2.goto(APP + '/app/tienda');
  await pageT2.waitForSelector('[data-testid=orden-tienda]:has-text("Reclamo #")');
  await page.goto(APP + '/admin?tab=reclamos');
  await page.waitForSelector('[data-testid=admin-reclamo]:has-text("otra edición") img');
  await page.click('[data-testid=admin-reclamo] [data-testid=btn-resolver-reclamo]');
  await page.click('[data-testid=resolucion-devolver]');
  await page.fill('[data-testid=input-nota-resolucion]', 'Confirmado: era otra edición');
  await page.click('[data-testid=btn-confirmar-resolucion]');
  await page.waitForSelector('.toast:has-text("resuelto")');
  if (sql(`select estado || ':' || anulada_por || ':' || falta_vendedor from public.ordenes where id = '${ordenB2}'`) !== 'cancelada:reclamo:true') throw new Error('la orden no se anuló por el reclamo');
  if (num(`select cantidad from public.entradas where usuario_id = '${LUCIA}' and carta_id = 'sv03.5-003'`) !== 2) throw new Error('la copia reclamada no volvió a la vendedora');
  if (sql(`select public.saldo_de('${CHRIS}')`) !== '10.00') throw new Error('la devolución del reclamo no llegó al saldo');
  if (!/Confirmado: era otra edición/.test(sql(`select cuerpo from public.notificaciones where usuario_id = '${LUCIA}' and tipo = 'reclamo_resuelto' order by id desc limit 1`))) throw new Error('la vendedora no recibió la resolución');
  await pageT2.reload();
  await pageT2.waitForSelector('text=Devolver al vendedor');
  await foto(pageT2, 'tienda-devolver');
  await ctxT2.close();
  await page.goto(APP + '/app/compras/' + pagoB2);
  await page.waitForSelector('[data-testid=orden-reclamo-resuelto]:has-text("devolución completa")');
  log('reclamo en tienda con foto: orden en disputa (tienda avisada), resuelto en /admin con devolución → saldo S/ 10.00, copia devuelta, falta registrada');

  // retiro del saldo a Yape/Plin: entra al Excel del siguiente día de pago
  await page.goto(APP + '/app/compras');
  await page.waitForSelector('[data-testid=btn-retirar-saldo]');
  await page.click('[data-testid=btn-retirar-saldo]');
  await page.click('.sheet-foot >> text=Sí, retirar');
  await page.waitForSelector('.toast:has-text("Retiro de S/ 10.00")');
  if (sql(`select estado || ':' || origen || ':' || monto from public.retiros where usuario_id = '${CHRIS}' and origen = 'saldo'`) !== 'sin_datos:saldo:10.00' || sql(`select public.saldo_de('${CHRIS}')`) !== '0.00') throw new Error('el retiro del saldo no quedó registrado');
  await page.goto(APP + '/admin?tab=cobros');
  await page.waitForSelector('[data-testid=select-modo-limite]');
  if ((await page.inputValue('[data-testid=select-modo-limite]')) !== 'dias' || (await page.inputValue('[data-testid=input-entrega-dias]')) !== '7') throw new Error('los ajustes de plazo no muestran 7 días');
  log('retiro del saldo (S/ 10.00, sin datos de cobro → pendiente de datos) y ajustes de plazo: 7 días y 48 h');

  // ---------- Fase 4 · C: reportes del administrador (ventas, comisiones, devoluciones, top vendedores) + Excel
  const [ventasEsp, comisionesEsp, ordenesEsp] = sql(`select coalesce(sum(subtotal), 0) || '|' || coalesce(sum(comision), 0) || '|' || count(*) from public.ordenes where estado in ('entregada', 'saldo_liberado') and entregada_en >= (current_date - 29)::timestamp at time zone 'America/Lima'`).split('|');
  const devolucionesEsp = num(`select count(*) from public.ordenes where (estado = 'vencida' or (estado = 'cancelada' and anulada_por = 'reclamo')) and actualizada >= (current_date - 29)::timestamp at time zone 'America/Lima'`);
  if (Number(ventasEsp) < 100 || Number(ordenesEsp) < 1 || devolucionesEsp < 2) throw new Error('datos de prueba insuficientes para el reporte: ' + JSON.stringify({ ventasEsp, ordenesEsp, devolucionesEsp }));
  await page.goto(APP + '/admin?tab=reportes');
  await page.waitForSelector('[data-testid=reporte-totales]');
  const ventasUI = await page.textContent('[data-testid=reporte-ventas]');
  const comisionesUI = await page.textContent('[data-testid=reporte-comisiones]');
  if (ventasUI !== pen(ventasEsp) || comisionesUI !== pen(comisionesEsp)) throw new Error(`el reporte no cuadra con la base: UI ${ventasUI} / ${comisionesUI}, base ${pen(ventasEsp)} / ${pen(comisionesEsp)}`);
  const totalesTxt = await page.textContent('[data-testid=reporte-totales]');
  if (!new RegExp(`${ordenesEsp} (orden|órdenes)`).test(totalesTxt) || !totalesTxt.includes(`${devolucionesEsp}devoluciones`)) throw new Error('órdenes o devoluciones no coinciden en el reporte: ' + totalesTxt);
  await page.waitForSelector('[data-testid=reporte-vendedor]:has-text("@vendedora_lima")');
  if (!/faltas/.test(await page.textContent('[data-testid=reporte-vendedor]:has-text("@vendedora_lima")'))) throw new Error('el top de vendedores no muestra las faltas de la vendedora');
  if ((await page.$$('[data-testid=reporte-grafico] .barra')).length < 1) throw new Error('el gráfico no tiene barras');
  // agrupar por mes y comprobar que la serie cambia de formato
  await page.click('[data-testid=admin-reportes] .seg >> text=12 meses');
  await page.waitForSelector('[data-testid=reporte-totales]');
  await page.waitForSelector('[data-testid=admin-reportes] td:text-matches("^[0-9]{4}-[0-9]{2}$")');
  await foto(page, 'admin-reportes');
  // sin sesión de administrador el reporte no se entrega
  const ctxSinSesion = await browser.newContext({ locale: 'es-PE' });
  const repAnon = await ctxSinSesion.request.get(APP + '/api/admin/reportes');
  if (repAnon.ok() || (await repAnon.json()).ok) throw new Error('el reporte se entregó sin sesión de administrador');
  await ctxSinSesion.close();
  // Excel con hojas Resumen / Por período / Vendedores / Compradores / Cartas / Órdenes
  const xlsxRep = await page.request.get(APP + '/api/admin/reportes/excel?desde=' + sql(`select (current_date - 29)::text`) + '&hasta=' + sql(`select current_date::text`) + '&grupo=dia');
  if (!xlsxRep.ok() || !/spreadsheetml/.test(xlsxRep.headers()['content-type'] || '') || !/reporte-poketcg-/.test(xlsxRep.headers()['content-disposition'] || '')) throw new Error('no se pudo descargar el Excel del reporte: ' + xlsxRep.status());
  const wbRep = new ExcelJS.Workbook();
  await wbRep.xlsx.load(await xlsxRep.body());
  for (const hoja of ['Resumen', 'Por período', 'Vendedores', 'Compradores', 'Cartas', 'Órdenes']) if (!wbRep.getWorksheet(hoja)) throw new Error('falta la hoja ' + hoja + ' en el Excel del reporte');
  const filasOrd = [];
  wbRep.getWorksheet('Órdenes').eachRow((r, i) => { if (i > 1) filasOrd.push(r.values); });
  if (filasOrd.length !== Number(ordenesEsp) || !filasOrd.some(f => f[4] === '@vendedora_lima' && /Tienda E2E/.test(String(f[5])) && Number(f[8]) > 0)) throw new Error('la hoja Órdenes no coincide: ' + JSON.stringify(filasOrd.map(f => [f[1], f[4], f[5], f[8]])));
  const filasVen = [];
  wbRep.getWorksheet('Vendedores').eachRow((r, i) => { if (i > 1) filasVen.push(r.values); });
  if (!filasVen.some(f => f[1] === '@vendedora_lima' && Number(f[6]) >= 1)) throw new Error('la hoja Vendedores no muestra a la vendedora con sus faltas: ' + JSON.stringify(filasVen));
  log('reportes en /admin: ventas', ventasUI, '· comisiones', comisionesUI, '·', ordenesEsp, 'órdenes ·', devolucionesEsp, 'devoluciones · gráfico por día y por mes · Excel con 6 hojas');

  // ---------- Fase 4 · D: confianza pública (ficha de carta, tiendas, ayuda, portada con cifras, sitemap), favoritos y modo oscuro
  // el administrador completa la tienda: tarifa de recojo, Instagram y coordenadas (mapa)
  const tiendaE2E = JSON.parse(sql(`select row_to_json(t) from public.tiendas t where id = '${TIENDA_E2E}'`));
  const guardarTienda = await page.request.post(APP + '/api/admin/tiendas', { data: { ...tiendaE2E, tarifa_recojo: 2, instagram: '@tiendae2e', lat: -12.0862, lon: -77.0346, mapa_url: '' } });
  if (!guardarTienda.ok() || !(await guardarTienda.json()).ok) throw new Error('no se pudo guardar la tarifa de recojo: ' + guardarTienda.status());
  const ctxPub = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
  const pagePub = await ctxPub.newPage();
  // ficha pública de la carta vendida (sin sesión): nombre, última venta, promedio, JSON-LD y título para Google
  const precioVenta = sql(`select round(sum(cantidad * precio_pen) / sum(cantidad), 2) from public.ventas_publicas where carta_id = 'sv03.5-001'`);   // promedio por copia
  await pagePub.goto(APP + '/carta/sv03.5-001');
  await pagePub.waitForSelector('[data-testid=ficha-publica]');
  if (!/Bulbasaur/.test(await pagePub.textContent('[data-testid=ficha-nombre]'))) throw new Error('la ficha pública no muestra el nombre');
  if (!(await pagePub.textContent('[data-testid=ficha-promedio]')).includes(pen(precioVenta))) throw new Error('la ficha no muestra el promedio de ventas ' + pen(precioVenta) + ': ' + await pagePub.textContent('[data-testid=ficha-promedio]'));
  if ((await pagePub.$$('[data-testid=ficha-venta]')).length < 1 || !/@vendedora_lima/.test(await pagePub.textContent('[data-testid=ficha-publica]'))) throw new Error('la ficha no lista las ventas con el vendedor');
  // el comprador no aparece en las ventas (chris sí puede figurar como vendedor: publicó Bulbasaur ES en el bloque C)
  for (const v of await pagePub.$$('[data-testid=ficha-venta]')) if (/chris_tcg/.test(await v.textContent())) throw new Error('la ficha pública expone al comprador');
  const htmlFicha = await pagePub.content();
  if (!/"@type":"Product"/.test(htmlFicha) || !/Bulbasaur.*precio en Perú/.test(await pagePub.title())) throw new Error('faltan los datos para buscadores en la ficha: ' + await pagePub.title());
  await foto(pagePub, 'ficha-publica');
  // tiendas: ambas sedes, tarifa de recojo, gratis, cómo llegar y mapa
  await pagePub.goto(APP + '/tiendas', { waitUntil: 'domcontentloaded' });
  await pagePub.waitForSelector('[data-testid=tienda-publica]:has-text("Tienda E2E")');
  const textoTiendas = await pagePub.textContent('[data-testid=tiendas-publicas]');
  for (const esperado of ['TCG Center Perú', 'Tienda E2E', 'S/ 2.00', 'Recojo gratis', 'Lince', '@tiendae2e']) if (!textoTiendas.includes(esperado)) throw new Error('/tiendas no muestra «' + esperado + '»');
  if ((await pagePub.$$('[data-testid=tienda-publica] a:has-text("Cómo llegar")')).length < 2 || !(await pagePub.$('[data-testid=tienda-publica]:has-text("Tienda E2E") iframe.mapa'))) throw new Error('/tiendas sin enlaces de cómo llegar o sin mapa');
  // centro de ayuda: 4 secciones, buscador y contacto
  await pagePub.goto(APP + '/ayuda');
  await pagePub.waitForSelector('[data-testid=faq]');
  const nPreguntas = (await pagePub.$$('[data-testid=faq-pregunta]')).length;
  if (nPreguntas < 30 || (await pagePub.$$('[data-testid=faq-seccion]')).length !== 4) throw new Error('la ayuda debía tener 4 secciones y 30+ preguntas: ' + nPreguntas);
  await pagePub.fill('[data-testid=faq-buscar]', 'código de retiro');
  await pagePub.waitForFunction(() => document.querySelectorAll('[data-testid=faq-pregunta]').length < 30 && document.querySelectorAll('[data-testid=faq-pregunta][open]').length > 0);
  const textoAyuda = await pagePub.textContent('[data-testid=ayuda]');
  if (!/comisión del 5 %/.test(textoAyuda) || !/7 días después de confirmado el pago/.test(textoAyuda) || !/48 horas/.test(textoAyuda)) throw new Error('la ayuda no usa los ajustes vigentes');
  const whatsappApp = sql(`select coalesce(valor->>'whatsapp', '') from public.ajustes_globales where clave = 'pagos'`);
  if (whatsappApp && !(await pagePub.$(`[data-testid=ayuda-contacto] a[href*="wa.me/51${whatsappApp}"]`))) throw new Error('la ayuda no muestra el WhatsApp de contacto');
  await foto(pagePub, 'ayuda');
  // portada con cifras y novedades; sitemap y robots para buscadores
  await pagePub.goto(APP + '/');
  await pagePub.waitForSelector('[data-testid=cifras-comunidad]');
  const textoPortada = await pagePub.textContent('#main');
  if (!/cartas vendidas/.test(textoPortada) || !/Últimas ventas/.test(textoPortada) || !/Bulbasaur/.test(textoPortada) || !/Cómo funciona el mercado/.test(textoPortada)) throw new Error('la portada no muestra cifras y últimas ventas');
  const sitemap = await (await fetch(APP + '/sitemap.xml')).text();
  for (const u of ['/ayuda', '/tiendas', '/carta/sv03.5-001', '/u/vendedora_lima']) if (!sitemap.includes(u)) throw new Error('el sitemap no incluye ' + u);
  const robots = await (await fetch(APP + '/robots.txt')).text();
  if (!/Disallow: \/app/.test(robots) || !/Sitemap: .*\/sitemap\.xml/.test(robots)) throw new Error('robots.txt inesperado: ' + robots);
  await ctxPub.close();
  log('público sin sesión: ficha /carta con ventas (' + pen(precioVenta) + ') y JSON-LD, /tiendas con tarifa y mapa, /ayuda con ' + nPreguntas + ' preguntas y buscador, portada con cifras, sitemap y robots');

  // favoritos: el comprador marca una carta sin ofertas; cuando la vendedora la publica recibe el aviso y la ve en su lista de deseos
  await page.goto(APP + '/app/carta/sv03.5-005');
  await page.waitForSelector('[data-testid=btn-favorito]');
  await page.click('[data-testid=btn-favorito]');
  await page.waitForSelector('.toast:has-text("lista de deseos")');
  if (num(`select count(*) from public.favoritos where usuario_id = '${CHRIS}' and carta_id = 'sv03.5-005'`) !== 1) throw new Error('el favorito no se guardó');
  // la vendedora guarda la carta en su caja en venta (se publica sola al precio por defecto) y fija S/ 12 manual
  const entradaFav = sql(`insert into public.entradas (usuario_id, caja_id, carta_id, cantidad, acabado, idioma, condicion) values ('${LUCIA}', '${CAJA_LUCIA}', 'sv03.5-005', 1, 'Normal', 'ES', 'LP') returning id`);
  rpcComo(LUCIA, `update public.publicaciones set tipo_precio = 'manual', precio_pen = 12, estado = 'activa', motivo_pausa = null where entrada_id = '${entradaFav}'`);
  if (sql(`select estado || ':' || precio_pen from public.publicaciones where entrada_id = '${entradaFav}'`) !== 'activa:12.00') throw new Error('la publicación de la vendedora no quedó activa a S/ 12: ' + sql(`select estado || ':' || precio_pen || ':' || coalesce(motivo_pausa, '') from public.publicaciones where entrada_id = '${entradaFav}'`));
  if (sql(`select titulo || '|' || enlace from public.notificaciones where usuario_id = '${CHRIS}' and tipo = 'favorito' order by id desc limit 1`) !== '❤️ Charmeleon (MEW 005) está en venta|/app/carta/sv03.5-005') throw new Error('el aviso de favorito no llegó: ' + sql(`select titulo || '|' || enlace from public.notificaciones where usuario_id = '${CHRIS}' and tipo = 'favorito' order by id desc limit 1`));
  await page.goto(APP + '/app/notificaciones');
  await page.waitForSelector('text=Charmeleon (MEW 005) está en venta');
  await page.goto(APP + '/app/mercado/buscar');
  await page.waitForSelector('[data-testid=btn-lista-deseos]:has-text("(1)")');
  await page.click('[data-testid=btn-lista-deseos]');
  await page.waitForSelector('[data-testid=fila-deseo]:has-text("1 copia")');
  if (!/S\/ 12\.00/.test(await page.textContent('[data-testid=fila-deseo]'))) throw new Error('la lista de deseos no muestra la mejor oferta');
  await foto(page, 'lista-deseos');
  await page.click('[data-testid=btn-quitar-deseo]');
  await page.waitForSelector('[data-testid=lista-deseos]', { state: 'detached' });
  if (num(`select count(*) from public.favoritos where usuario_id = '${CHRIS}'`) !== 0) throw new Error('quitar de la lista no borró el favorito');
  log('favoritos: ❤️ en la carta → aviso "está en venta" cuando la vendedora publica (S/ 12.00) → lista de deseos en el Mercado → quitar');

  // modo oscuro: se elige en Ajustes, se guarda por usuario en el dispositivo y se aplica antes de pintar al recargar
  // Ajustes de layout · 8: por defecto claro aunque el sistema esté en oscuro
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(APP + '/app/ajustes');
  await page.waitForSelector('[data-testid=selector-tema]');
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'light' || !(await page.$('[data-testid=tema-claro].active'))) throw new Error('sin elección guardada la app debía abrir en claro aunque el sistema esté en oscuro');
  if ((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== 'rgb(255, 246, 229)') throw new Error('el fondo por defecto debía ser crema: ' + await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  await page.click('[data-testid=tema-oscuro]');
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'dark') throw new Error('el tema oscuro no se aplicó');
  await page.reload();
  await page.waitForSelector('[data-testid=selector-tema]');
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'dark' || !(await page.$('[data-testid=tema-oscuro].active'))) throw new Error('el tema oscuro no se conservó al recargar');
  await foto(page, 'modo-oscuro');
  await page.click('[data-testid=tema-auto]');
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== null) throw new Error('el tema automático no quitó el atributo');
  if ((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 246, 229)') throw new Error('en Automático con el sistema en oscuro debía verse oscuro');
  await page.click('[data-testid=tema-claro]');
  await page.emulateMedia({ colorScheme: 'light' });
  log('modo claro por defecto (aunque el sistema esté en oscuro); Ajustes → Oscuro se conserva al recargar; Automático sigue al sistema');

  // ---------- Mejoras 3 · B: fondo de la app (Ajustes → Apariencia → Fondo de la app), guardado en el perfil
  await page.goto(APP + '/app/ajustes');
  await page.waitForSelector('[data-testid=selector-fondo]');
  const fondos = await page.$$eval('[data-testid=selector-fondo] .fondo-opcion .rotulo-fondo', els => els.map(e => e.textContent.replace('Elegido', '').trim()));
  if (fondos.join(' · ') !== 'Liso · Llamas · Olas · Hojas · Rayos · Estrellas · Aleatorio') throw new Error('opciones de fondo inesperadas: ' + fondos.join(' · '));
  const fondoApp = async () => page.$eval('[data-testid=fondo-app]', e => ({ fondo: e.dataset.fondo, patron: e.dataset.patron || null, intensidad: e.dataset.intensidad || null, svgs: e.querySelectorAll('svg').length, opacidad: e.querySelector('svg') ? getComputedStyle(e.querySelector('svg')).opacity : null, color: getComputedStyle(e).color, fijo: getComputedStyle(e).position, z: getComputedStyle(e).zIndex }));
  let f = await fondoApp();
  if (!(await page.$('[data-testid=fondo-hojas].active')) || f.patron !== 'hojas' || f.opacidad !== '0.08' || f.svgs !== 1 || f.fijo !== 'fixed' || f.z !== '-1') throw new Error('por defecto debía haber un solo SVG fijo con Hojas al 8 %: ' + JSON.stringify(f));
  if (!(await page.$('[data-testid=fondo-aleatorio] .nota:has-text("cambia cada día")'))) throw new Error('Aleatorio debía decir que cambia cada día');
  // el perfil se actualiza poco después (las escrituras van en fila): se espera hasta 6 s a que la base tenga el valor
  const esperarPerfil = async (valor) => { for (let i = 0; i < 30; i++) { if (sql("select fondo || ':' || fondo_intensidad from public.perfiles where username = 'chris_tcg'") === valor) return; await page.waitForTimeout(200); } throw new Error('el perfil no quedó con ' + valor + ': ' + sql("select fondo || ':' || fondo_intensidad from public.perfiles where username = 'chris_tcg'")); };
  await page.click('[data-testid=fondo-olas]');
  await page.waitForSelector('[data-testid=fondo-app][data-patron=olas]');
  await esperarPerfil('olas:40');
  await page.focus('[data-testid=intensidad-fondo]');
  await page.keyboard.press('End');
  await page.waitForSelector('[data-testid=fondo-app][data-intensidad="100"]');
  f = await fondoApp();
  if (f.opacidad !== '0.2') throw new Error('intensidad 100 % debía ser opacidad 0.2: ' + JSON.stringify(f));
  await esperarPerfil('olas:100');
  await page.reload();
  await page.waitForSelector('[data-testid=fondo-app][data-patron=olas][data-intensidad="100"]');
  await page.waitForSelector('[data-testid=selector-fondo]');
  if (!(await page.$('[data-testid=fondo-olas].active'))) throw new Error('tras recargar debía seguir Olas al 100 %');
  await foto(page, 'fondo-olas');
  // Aleatorio: hoy toca uno de los cinco patrones; Liso: sin patrón
  await page.click('[data-testid=fondo-aleatorio]');
  await page.waitForSelector('[data-testid=fondo-app][data-fondo=aleatorio]');
  f = await fondoApp();
  if (!['llamas', 'olas', 'hojas', 'rayos', 'estrellas'].includes(f.patron)) throw new Error('Aleatorio debía elegir un patrón: ' + JSON.stringify(f));
  await page.click('[data-testid=fondo-liso]');
  await page.waitForSelector('[data-testid=fondo-app].liso');
  if ((await fondoApp()).svgs !== 0) throw new Error('Liso no debía dibujar ningún patrón');
  // modo oscuro: el patrón en tono claro con la misma opacidad; claro: el color del patrón
  await page.click('[data-testid=fondo-hojas]');
  await page.waitForSelector('[data-testid=fondo-app][data-patron=hojas]');
  await page.click('[data-testid=tema-oscuro]');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
  f = await fondoApp();
  if (f.color !== 'rgb(220, 227, 255)' || f.opacidad !== '0.2') throw new Error('en oscuro el patrón debía ser claro: ' + JSON.stringify(f));
  await page.click('[data-testid=tema-claro]');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');
  if ((await fondoApp()).color !== 'rgb(30, 138, 87)') throw new Error('en claro Hojas debía ser verde');
  // sin las columnas del perfil (0008 sin pegar) la elección se recuerda en el dispositivo
  sql('alter table public.perfiles drop column if exists fondo; alter table public.perfiles drop column if exists fondo_intensidad;');
  await page.reload();
  await page.waitForSelector('[data-testid=selector-fondo]');
  await page.click('[data-testid=fondo-rayos]');
  await page.waitForSelector('[data-testid=fondo-app][data-patron=rayos]');
  await page.reload();
  await page.waitForSelector('[data-testid=fondo-app][data-patron=rayos]');
  execSync('su postgres -c "psql -q -d poketcg_test -f supabase/migrations/0008_mejoras3.sql"');
  await page.click('[data-testid=fondo-hojas]');
  await page.evaluate(() => { const r = document.querySelector('[data-testid=intensidad-fondo]'); r.focus(); });
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.waitForSelector('[data-testid=fondo-app][data-patron=hojas][data-intensidad="40"]');
  await esperarPerfil('hojas:40');
  log('fondo de la app: Hojas al 8 % por defecto (un SVG fijo); Olas + 100 % guardado en el perfil y conservado al recargar; Aleatorio y Liso; tono claro en oscuro; sin columnas se recuerda en el dispositivo');

  // ---------- Mejoras 1 · A1: desplazamiento hasta el final en todas las páginas principales (PC y celular), también tras abrir y cerrar una hoja
  const cajaChris = sql(`select id from public.cajas where usuario_id = '${CHRIS}' order by orden limit 1`);
  const PAGINAS_SCROLL = ['/app/buscar', '/app/album', '/app/album/sv03.5', '/app/bulk', `/app/bulk/${cajaChris}`, '/app/mercado', '/app/mercado/buscar', '/app/carrito', '/app/mazos', '/app/compras', '/app/ventas', '/app/notificaciones', '/app/ajustes', '/admin', '/ayuda', '/tiendas', '/u/vendedora_lima', '/carta/sv03.5-001'];
  const comprobarScroll = async (pg, etiqueta) => {
    const problemas = [];
    for (const ruta of PAGINAS_SCROLL) {
      await pg.goto(APP + ruta, { waitUntil: 'networkidle' }).catch(() => {});
      await pg.waitForTimeout(500);
      // baja con la rueda (como una persona) y luego hasta el final
      for (let i = 0; i < 6; i++) await pg.mouse.wheel(0, 1500).catch(() => {});
      await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await pg.waitForTimeout(300);
      const e = await pg.evaluate(() => ({ y: Math.round(scrollY), h: document.documentElement.scrollHeight, inner: innerHeight, overflow: document.body.style.overflow, llego: Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2, hojas: document.querySelectorAll('.sheet-backdrop').length, anchoExtra: document.documentElement.scrollWidth - innerWidth }));
      if (!e.llego || e.overflow || e.hojas || e.anchoExtra > 2) problemas.push(`${ruta}: ${JSON.stringify(e)}`);
      // Mejoras 1 · E: todo lo tocable mide al menos 44 px de alto (botones, chips, pestañas, campos, pasos +/−)
      const bajos = await pg.evaluate(() => [...document.querySelectorAll('.btn, .chipbtn, .subtabs a, .tabbar a, .tabs a, .input, .seg button, .stepper button, .menu-perfil .avatar')].filter(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.height < 44; }).slice(0, 5).map(el => `${el.className.split(' ').slice(0, 2).join('.')}:${Math.round(el.getBoundingClientRect().height)}px "${(el.textContent || '').trim().slice(0, 20)}"`));
      if (bajos.length) problemas.push(`${ruta}: elementos tocables de menos de 44 px: ${bajos.join(', ')}`);
    }
    // abre una hoja en Buscar ("+ otra copia"), la cierra con Escape y comprueba que se puede seguir bajando
    await pg.goto(APP + '/app/buscar');
    await pg.waitForSelector('text=+ otra copia');
    await pg.evaluate(() => window.scrollTo(0, 400));
    await pg.click('text=+ otra copia >> nth=0');
    await pg.waitForSelector('.sheet-backdrop');
    const conHoja = await pg.evaluate(() => document.body.style.overflow);
    await pg.keyboard.press('Escape');
    await pg.waitForSelector('.sheet-backdrop', { state: 'detached' });
    await pg.evaluate(() => window.scrollTo(0, 0));
    for (let i = 0; i < 4; i++) await pg.mouse.wheel(0, 1200);
    await pg.waitForTimeout(400);
    const trasHoja = await pg.evaluate(() => ({ y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, overflow: document.body.style.overflow }));
    if (conHoja !== 'hidden' || trasHoja.overflow !== '' || trasHoja.y < Math.min(1000, trasHoja.max - 2)) problemas.push(`tras abrir y cerrar una hoja: ${JSON.stringify({ conHoja, trasHoja })}`);
    if (problemas.length) throw new Error(`desplazamiento con problemas (${etiqueta}):\n` + problemas.join('\n'));
  };
  await comprobarScroll(page, 'celular 420×860');
  const ctxPc = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE' });
  const pagePc = await ctxPc.newPage();
  await entrar(pagePc, 'chris_tcg', 'clave12345');
  await comprobarScroll(pagePc, 'PC 1280×800');
  // Ajustes de layout 2 · 1 (PC): el buscador de la barra superior tiene cámara, el menú lateral ya no tiene "Buscar / Escanear"
  // y buscar desde la barra lleva a los resultados con ubicación y botones
  await pagePc.goto(APP + '/app/album');
  await pagePc.waitForSelector('[data-testid=menu-lateral] .lateral-menu a');
  const menuLateral = await pagePc.$$eval('[data-testid=menu-lateral] .lateral-menu a', els => els.map(e => e.textContent.trim()));
  if (menuLateral.map(t => t.replace(/\s*\d+$/, '')).join(' · ') !== 'Álbumes · Bulk · Mazos' || !(await pagePc.$('[data-testid=buscador-pc] [data-testid=btn-camara]'))) throw new Error('PC: menú lateral Álbumes · Bulk · Mazos y buscador con cámara esperados: ' + menuLateral.join(' | '));
  await pagePc.fill('[data-testid=buscador-pc] input', 'pikachu 151');
  await pagePc.press('[data-testid=buscador-pc] input', 'Enter');
  await pagePc.waitForURL(/\/app\/buscar\?q=pikachu/);
  await pagePc.waitForSelector('[data-testid=resultados-buscar] .card-row [data-testid=btn-ver-mercado]');
  if (!(await pagePc.$('[data-testid=menu-lateral]'))) throw new Error('PC: los resultados de búsqueda debían conservar el menú lateral de Mi Colección');
  await foto(pagePc, 'pc-buscar');
  // Ajustes de layout 2 · 2 (PC): Mis ventas es una sección del Mercado con chips arriba del contenido (sin menú lateral)
  await pagePc.goto(APP + '/app/ventas');
  await pagePc.waitForSelector('[data-testid=sec-ventas].active');
  if ((await pagePc.$('[data-testid=menu-lateral]')) || !(await pagePc.$('[data-testid=tab-mercado].active')) || !(await pagePc.isVisible('[data-testid=subtabs]'))) throw new Error('PC: Mis ventas debía mostrarse en el Mercado con chips y sin menú lateral');
  await foto(pagePc, 'pc-ventas');
  // Ajustes de layout 2 · 4 y Mejoras 4 · A (PC 1280×800): el libro ocupa casi toda la pantalla: una fila de herramientas,
  // fila compacta, menú Acciones, "Ir a" junto al texto; la página completa entra sin bajar en todas las cuadrículas y en 1 o 2 páginas
  await pagePc.goto(APP + '/app/album/sv03.5');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta][data-cuadricula="4x5"]');
  const celdasPc = async () => (await pagePc.$$('.album-cell')).length;
  const medidasPc = async () => pagePc.evaluate(() => { const h = document.querySelector('[data-testid=hoja-carpeta]').getBoundingClientRect(); const t = document.querySelector('[data-testid=libro-herramientas]').getBoundingClientRect(); return { hojaAbajo: Math.round(h.bottom), hojaAncho: Math.round(h.width), alto: innerHeight, ancho: innerWidth, scroll: document.documentElement.scrollHeight, herramientasAlto: Math.round(t.height), cubre: Math.round(100 * h.width * h.height / (innerWidth * innerHeight)) }; });
  let m = await medidasPc();
  const opcionesPc = await pagePc.$$eval('[data-testid=selector-cuadricula] option', els => els.map(e => e.textContent.trim()));
  if (opcionesPc.join(' ') !== '3×3 3×4 4×4 4×5 4×6' || (await pagePc.inputValue('[data-testid=selector-cuadricula]')) !== '4x5' || (await pagePc.inputValue('[data-testid=selector-paginas]')) !== '1') throw new Error('PC: selector de cuadrícula inesperado: ' + opcionesPc.join(' '));
  if ((await celdasPc()) !== 20 || !/Página 1 de 11/.test(await pagePc.textContent('[data-testid=pagina-texto]'))) throw new Error('PC: 4×5 debía mostrar 20 casillas de 11 páginas');
  if (m.hojaAbajo > m.alto || m.scroll > m.alto + 2 || m.herramientasAlto > 56 || (await pagePc.$('[data-testid=album-lateral]'))) throw new Error('PC: la página completa debía verse sin bajar, con una sola fila de herramientas y sin panel derecho: ' + JSON.stringify(m));
  if ((await pagePc.$$('[data-testid=ir-a-pagina] option')).length !== 11) throw new Error('PC: "Ir a" debía tener 11 páginas');
  const distintasPc = num(`select count(distinct carta_id) from public.entradas where usuario_id = '${CHRIS}' and carta_id like 'sv03.5-%'`);   // todos los idiomas (sin ?idioma=)
  if (!new RegExp(`^${distintasPc} / 207 · ${Math.round(100 * distintasPc / 207)} % · S/ `).test((await pagePc.textContent('[data-testid=progreso-album]')).trim())) throw new Error(`PC: fila compacta inesperada (${distintasPc} cartas distintas): ` + await pagePc.textContent('[data-testid=progreso-album]'));
  await pagePc.click('[data-testid=btn-acciones]');
  const itemsAcciones = await pagePc.$$eval('[data-testid=menu-acciones] [role=menuitem]', els => els.map(e => e.textContent.trim()));
  if (!itemsAcciones[0].startsWith('Agregar carta') || !itemsAcciones.some(t => t.startsWith('Comprar faltantes'))) throw new Error('PC: menú Acciones inesperado: ' + itemsAcciones.join(' | '));
  await pagePc.keyboard.press('Escape');
  await pagePc.waitForSelector('[data-testid=menu-acciones]', { state: 'detached' });
  await foto(pagePc, 'pc-album-4x5');
  // todas las cuadrículas, en 1 y 2 páginas, entran completas sin bajar; con 2 páginas (hasta 4×4) la hoja ocupa la mayor parte del ancho
  for (const [paginas, cuadricula, esperadas] of [['1', '3x3', 9], ['1', '3x4', 12], ['1', '4x4', 16], ['1', '4x6', 24], ['2', '4x4', 32], ['2', '3x4', 24], ['2', '3x3', 18]]) {
    await pagePc.selectOption('[data-testid=selector-paginas]', paginas);
    await pagePc.selectOption('[data-testid=selector-cuadricula]', cuadricula);
    await pagePc.waitForSelector(`[data-testid=hoja-carpeta][data-cuadricula="${cuadricula}"]${paginas === '2' ? '.doble' : ':not(.doble)'}`);
    await pagePc.waitForTimeout(150);
    m = await medidasPc();
    // la hoja aprovecha el alto (llega casi abajo) o el ancho (3 columnas con 2 páginas son páginas altas: las limita el alto)
    if ((await celdasPc()) !== esperadas || m.hojaAbajo > m.alto || m.scroll > m.alto + 2 || !(m.hojaAbajo >= m.alto - 40 || m.hojaAncho >= 0.8 * m.ancho) || (paginas === '2' && cuadricula === '4x4' && m.hojaAncho < 0.6 * m.ancho)) throw new Error(`PC: ${cuadricula} × ${paginas} página(s): ${esperadas} casillas, completa sin bajar y grande: ` + JSON.stringify({ celdas: await celdasPc(), ...m }));
  }
  const opcionesDoble = await pagePc.$$eval('[data-testid=selector-cuadricula] option', els => els.map(e => e.textContent.trim()));
  if (opcionesDoble.join(' ') !== '3×3 3×4 4×4' || !/Páginas 1 – 2 de 23/.test(await pagePc.textContent('[data-testid=pagina-texto]'))) throw new Error('PC: con 2 páginas las opciones llegan hasta 4×4: ' + opcionesDoble.join(' '));
  await pagePc.selectOption('[data-testid=selector-cuadricula]', '4x4');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta].doble[data-cuadricula="4x4"]');
  await pagePc.click('[data-testid=pagina-siguiente]');
  await pagePc.waitForSelector('[data-testid=pagina-texto]:has-text("Páginas 3 – 4 de 13")');
  await pagePc.selectOption('[data-testid=ir-a-pagina]', '11');
  await pagePc.waitForSelector('[data-testid=pagina-texto]:has-text("Páginas 11 – 12 de 13")');
  await foto(pagePc, 'pc-album-doble');
  await pagePc.selectOption('[data-testid=selector-paginas]', '1');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta]:not(.doble)[data-cuadricula="4x4"]');
  await pagePc.selectOption('[data-testid=selector-cuadricula]', '4x6');
  await pagePc.waitForSelector('[data-testid=pagina-texto]:has-text("de 9")');
  await pagePc.reload();
  await pagePc.waitForSelector('[data-testid=hoja-carpeta][data-cuadricula="4x6"]');
  if ((await pagePc.inputValue('[data-testid=selector-cuadricula]')) !== '4x6') throw new Error('PC: la cuadrícula 4×6 debía recordarse al recargar');
  // otro álbum arranca con la última elección (4×6) salvo que tenga la suya
  await pagePc.goto(APP + '/app/album/base1');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta][data-cuadricula="4x6"]');
  await pagePc.selectOption('[data-testid=selector-cuadricula]', '4x5');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta][data-cuadricula="4x5"]');
  await pagePc.goto(APP + '/app/album/sv03.5');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta][data-cuadricula="4x6"]');
  await pagePc.selectOption('[data-testid=selector-cuadricula]', '4x5');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta][data-cuadricula="4x5"]');
  // pantalla completa: solo la carpeta (el navegador sin cabeza la simula); la hoja entra completa y el mismo botón vuelve
  await pagePc.click('[data-testid=btn-pantalla-completa]');
  await pagePc.waitForTimeout(500);
  const completo = await pagePc.evaluate(() => !!document.fullscreenElement && document.fullscreenElement.classList.contains('libro'));
  if (completo) {
    const mc = await medidasPc();
    if (mc.hojaAbajo > mc.alto || !(await pagePc.$('.libro-completo'))) throw new Error('PC: en pantalla completa la hoja debía entrar completa: ' + JSON.stringify(mc));
    await pagePc.click('[data-testid=btn-pantalla-completa]');
    await pagePc.waitForFunction(() => !document.fullscreenElement);
  }
  // el + de las casillas que faltan se vuelve sólido al pasar el mouse
  await pagePc.hover('[data-testid=btn-mas-rapido] >> nth=0');
  await pagePc.waitForTimeout(250);
  const fondoHover = await pagePc.$eval('[data-testid=btn-mas-rapido] >> nth=0', e => getComputedStyle(e).backgroundColor);
  if (fondoHover !== 'rgb(31, 95, 204)') throw new Error('PC: el + debía volverse sólido al pasar el mouse: ' + fondoHover);
  log('álbum en PC: libro a casi toda la pantalla (sin panel derecho, fila compacta, menú Acciones, Ir a); todas las cuadrículas en 1 y 2 páginas entran sin bajar; 4×6 recordado; pantalla completa' + (completo ? ' OK' : ' (no disponible en pruebas)') + '; + sólido al pasar el mouse');
  // 1920×1080: la hoja también ocupa la mayor parte (2 páginas 4×4 ≥ 60 % del ancho) y entra sin bajar
  await pagePc.setViewportSize({ width: 1920, height: 1080 });
  await pagePc.selectOption('[data-testid=selector-paginas]', '2');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta].doble[data-cuadricula="4x4"]');
  await pagePc.waitForTimeout(300);
  m = await medidasPc();
  if (m.hojaAbajo > m.alto || m.scroll > m.alto + 2 || m.hojaAncho < 0.6 * m.ancho) throw new Error('1920×1080: la hoja debía ocupar la mayor parte sin bajar: ' + JSON.stringify(m));
  await foto(pagePc, 'pc-album-1920');
  await pagePc.selectOption('[data-testid=selector-paginas]', '1');
  await pagePc.selectOption('[data-testid=selector-cuadricula]', '4x5');
  await pagePc.waitForSelector('[data-testid=hoja-carpeta]:not(.doble)[data-cuadricula="4x5"]');
  await pagePc.setViewportSize({ width: 1280, height: 800 });
  await pagePc.waitForTimeout(300);
  // Ajustes de layout 2 · 5 (PC): flechas ≥ 56 px a los costados de la hoja, centradas en vertical, desactivadas en los extremos; teclado ← →
  const flechasPc = await pagePc.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const h = r('[data-testid=hoja-carpeta]'), a = r('[data-testid=pagina-anterior]'), s = r('[data-testid=pagina-siguiente]'); return { a: { w: Math.round(a.width), h: Math.round(a.height), x: Math.round(a.right), cy: Math.round(a.top + a.height / 2) }, s: { w: Math.round(s.width), h: Math.round(s.height), x: Math.round(s.left), cy: Math.round(s.top + s.height / 2) }, hoja: { l: Math.round(h.left), r: Math.round(h.right), cy: Math.round(h.top + h.height / 2) }, antDesactivada: document.querySelector('[data-testid=pagina-anterior]').disabled, texto: document.querySelector('[data-testid=pagina-texto]').getBoundingClientRect().bottom <= h.top }; });
  if (flechasPc.a.w < 56 || flechasPc.a.h < 56 || flechasPc.s.w < 56 || flechasPc.a.x > flechasPc.hoja.l || flechasPc.s.x < flechasPc.hoja.r || Math.abs(flechasPc.a.cy - flechasPc.hoja.cy) > 4 || Math.abs(flechasPc.s.cy - flechasPc.hoja.cy) > 4 || !flechasPc.antDesactivada || !flechasPc.texto) throw new Error('PC: flechas a los costados inesperadas: ' + JSON.stringify(flechasPc));
  await pagePc.keyboard.press('ArrowRight');
  await pagePc.waitForSelector('[data-testid=pagina-texto]:has-text("Página 2 de 11")');
  await pagePc.keyboard.press('ArrowRight');
  await pagePc.waitForSelector('[data-testid=pagina-texto]:has-text("Página 3 de 11")');
  await pagePc.keyboard.press('ArrowLeft');
  await pagePc.waitForSelector('[data-testid=pagina-texto]:has-text("Página 2 de 11")');
  // escribiendo en el buscador, las flechas del teclado no pasan de página
  await pagePc.focus('[data-testid=buscador-pc] input');
  await pagePc.keyboard.press('ArrowLeft');
  await pagePc.waitForTimeout(300);
  if (!/Página 2 de 11/.test(await pagePc.textContent('[data-testid=pagina-texto]'))) throw new Error('PC: con el cursor en un campo las flechas no debían pasar de página');
  await pagePc.click('[data-testid=pagina-siguiente]');
  await pagePc.waitForSelector('[data-testid=pagina-texto]:has-text("Página 3 de 11")');
  for (let i = 0; i < 8; i++) await pagePc.keyboard.press('ArrowRight');
  await pagePc.waitForSelector('[data-testid=pagina-texto]:has-text("Página 11 de 11")');
  if (!(await pagePc.$('[data-testid=pagina-siguiente][disabled]'))) throw new Error('PC: en la última página la flecha derecha debía estar desactivada');
  await foto(pagePc, 'pc-album-flechas');
  log('flechas a los costados en PC (56 px, centradas, desactivadas en los extremos) y teclado ← → (no desde un campo de texto)');
  // Mejoras 3 · C (PC): ventana centrada; teclas 1–4 eligen el acabado, Enter = guardar y siguiente, Esc = cerrar
  await pagePc.goto(APP + '/app/album/sv03.5?idioma=EN');
  await pagePc.waitForSelector('[data-testid=btn-mas-rapido]');
  await pagePc.click('.celda-libro:has([data-testid=casilla-falta]:has-text("002")) [data-testid=btn-mas-rapido]');
  await pagePc.waitForSelector('.sheet.hoja-rapida [data-testid=rapido-nombre]:has-text("Ivysaur")');
  const ventana = await pagePc.$eval('.sheet.hoja-rapida', e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), centrada: Math.abs((r.left + r.width / 2) - innerWidth / 2) < 4 }; });
  if (ventana.w !== 580 || !ventana.centrada) throw new Error('PC: la ventana de agregar rápido debía ir centrada y de 580 px: ' + JSON.stringify(ventana));
  await pagePc.keyboard.press('3');
  await pagePc.waitForSelector('[data-testid=acabado-reverse][aria-checked=true]');
  await pagePc.keyboard.press('2');
  await pagePc.waitForSelector('[data-testid=acabado-holo][aria-checked=true]');
  await foto(pagePc, 'pc-agregar-rapido');
  await pagePc.keyboard.press('Enter');
  await pagePc.waitForSelector('[data-testid=rapido-nombre]:has-text("Venusaur")');
  await pagePc.waitForSelector('[data-testid=casilla-tengo]:has-text("002")');
  if (sql(`select acabado from public.entradas where usuario_id = '${CHRIS}' and carta_id = 'sv03.5-002' and album_coleccion = 'sv03.5'`) !== 'Holo') throw new Error('PC: Enter debía guardar la 002 como Holo y pasar a la 003');
  await pagePc.keyboard.press('Escape');
  await pagePc.waitForSelector('.sheet.hoja-rapida', { state: 'detached' });
  if (!/Página 1 de 11/.test(await pagePc.textContent('[data-testid=pagina-texto]'))) throw new Error('PC: al cerrar con Esc debía seguir en la página 1');
  sql(`delete from public.entradas where usuario_id = '${CHRIS}' and carta_id = 'sv03.5-002'; delete from public.precios where carta_id in ('sv03.5-002', 'sv03.5-003')`);
  log('agregar rápido en PC: ventana centrada de 580 px; teclas 1–4, Enter (guardar y siguiente) y Esc (cerrar)');
  await ctxPc.close();
  const ctxCel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-PE' });
  const pageCel = await ctxCel.newPage();
  await entrar(pageCel, 'chris_tcg', 'clave12345');
  await comprobarScroll(pageCel, 'celular 390×844 táctil');
  await foto(pageCel, 'scroll-celular');
  // Ajustes de layout 2 · 5 (celular táctil): deslizar sobre la hoja pasa de página; flechas de 56 px montadas en los bordes, centradas
  await pageCel.goto(APP + '/app/album/sv03.5');
  await pageCel.waitForSelector('[data-testid=pagina-texto]:has-text("Página 1 de 23")');
  const deslizar = async (desdeX, hastaX) => pageCel.evaluate(([x1, x2]) => {
    const el = document.querySelector('[data-testid=zona-hoja]'); const r = el.getBoundingClientRect(); const y = r.top + r.height / 2;
    const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x1)], changedTouches: [t(x1)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x2)], bubbles: true }));
  }, [desdeX, hastaX]);
  await deslizar(300, 80);
  await pageCel.waitForSelector('[data-testid=pagina-texto]:has-text("Página 2 de 23")');
  await deslizar(300, 80);
  await pageCel.waitForSelector('[data-testid=pagina-texto]:has-text("Página 3 de 23")');
  await deslizar(80, 300);
  await pageCel.waitForSelector('[data-testid=pagina-texto]:has-text("Página 2 de 23")');
  await deslizar(200, 230);   // un toque corto no pasa de página
  await pageCel.waitForTimeout(300);
  if (!/Página 2 de 23/.test(await pageCel.textContent('[data-testid=pagina-texto]'))) throw new Error('celular: un deslizamiento corto no debía pasar de página');
  const flechasCel = await pageCel.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const h = r('[data-testid=hoja-carpeta]'), a = r('[data-testid=pagina-anterior]'), s = r('[data-testid=pagina-siguiente]'); return { aw: Math.round(a.width), ah: Math.round(a.height), acx: Math.round(a.left + a.width / 2), acy: Math.round(a.top + a.height / 2), scx: Math.round(s.left + s.width / 2), hl: Math.round(h.left), hr: Math.round(h.right), hcy: Math.round(h.top + h.height / 2) }; });
  if (flechasCel.aw < 56 || flechasCel.ah < 56 || Math.abs(flechasCel.acy - flechasCel.hcy) > 4 || Math.abs(flechasCel.acx - flechasCel.hl) > 30 || Math.abs(flechasCel.scx - flechasCel.hr) > 30) throw new Error('celular: flechas inesperadas: ' + JSON.stringify(flechasCel));
  await foto(pageCel, 'album-deslizar');
  log('celular: deslizar pasa de página (adelante y atrás; un toque corto no), flechas de 56 px en los bordes de la hoja');
  await pageCel.setViewportSize({ width: 360, height: 780 });
  await comprobarScroll(pageCel, 'celular angosto 360×780');
  // una hoja (guardar carta) a 360 px: botones del pie de ≥ 48 px y sin desbordes
  await pageCel.goto(APP + '/app/buscar');
  await pageCel.waitForSelector('text=+ otra copia');
  await pageCel.click('text=+ otra copia >> nth=0');
  await pageCel.waitForSelector('.sheet-foot .btn');
  const pie = await pageCel.$$eval('.sheet-foot .btn', els => els.map(el => Math.round(el.getBoundingClientRect().height)));
  if (pie.some(h => h < 48) || (await pageCel.evaluate(() => document.querySelector('.sheet').scrollWidth > document.querySelector('.sheet').clientWidth + 1))) throw new Error('la hoja a 360 px tiene botones chicos o desborde: ' + JSON.stringify(pie));
  await foto(pageCel, 'hoja-360');
  await ctxCel.close();
  log('desplazamiento: se llega al final de ' + PAGINAS_SCROLL.length + ' páginas en PC (1280×800) y celular (390×844 y 360×780), sin desbordes, con todo lo tocable ≥ 44 px, también después de abrir y cerrar una hoja');

  // ---------- app Android (APK): la portada ofrece la descarga cuando existe public/descargas/android.json (test/reiniciar.sh deja uno de prueba)
  const ctxP = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
  const pageP = await ctxP.newPage();
  await pageP.goto(APP + '/');
  await pageP.waitForSelector('[data-testid=instalar-app] [data-testid=btn-apk]');
  const infoApk = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'descargas', 'android.json'), 'utf8'));
  const textoApk = await pageP.textContent('[data-testid=btn-apk]');
  if (!textoApk.includes('versión ' + infoApk.version) || !textoApk.includes((infoApk.bytes / 1048576).toFixed(1).replace('.0', '') + ' MB')) throw new Error('el botón del APK no muestra versión y tamaño: ' + textoApk);
  const apk = await pageP.request.get(APP + '/descargas/poketcg.apk');
  if (!apk.ok() || apk.headers()['content-type'] !== 'application/vnd.android.package-archive' || !/attachment/.test(apk.headers()['content-disposition'] || '')) throw new Error('el APK no se sirve como descarga: ' + apk.status() + ' ' + apk.headers()['content-type']);
  const enlaces = await (await fetch(APP + '/.well-known/assetlinks.json')).json();
  if (enlaces[0]?.target?.package_name !== 'pe.poketcg.app' || !/^[0-9A-F:]{95}$/.test(enlaces[0]?.target?.sha256_cert_fingerprints?.[0] || '')) throw new Error('assetlinks.json inválido');
  await pageP.goto(APP + '/instalar');
  await pageP.waitForSelector('[data-testid=instalar-app] [data-testid=btn-apk]');
  await foto(pageP, 'portada-apk');
  await ctxP.close();
  log('portada e /instalar: descarga de la app Android (.apk v' + infoApk.version + ') y assetlinks.json para la app');

  // ---------- álbum automático
  await page.goto(APP + '/app/album');
  await page.waitForSelector('.album-card');
  const albumes = await page.$$eval('.album-card .album-title', els => els.map(e => e.textContent.trim()));
  if (!albumes.some(t => t.includes('151'))) throw new Error('no aparece el álbum 151: ' + albumes.join(' | '));
  await page.click('.album-card:has-text("151")');
  await page.waitForSelector('.album-cell');
  // álbum "sin idioma": tengo 025, 006 y 004 (la 001 comprada es ES) → 207 cartas en 23 páginas de 9, 204 faltan
  const filtros = await page.textContent('[data-testid=filtro-album]');
  const total = parseInt((/Tengo · (\d+)/.exec(filtros) || [])[1], 10) + parseInt((/Faltan · (\d+)/.exec(filtros) || [])[1], 10);
  const faltan = parseInt((/Faltan · (\d+)/.exec(filtros) || [])[1], 10);
  if (total !== 207 || faltan !== 204 || (await page.$$('.album-cell')).length !== 9 || !/de 23/.test(await page.textContent('[data-testid=pagina-texto]'))) throw new Error(`álbum 151: ${total} cartas, ${faltan} faltan (${filtros})`);
  await page.click('[data-testid=filtro-album] button:has-text("Faltan")');
  await page.waitForSelector('[data-testid=pagina-texto]:has-text("de 23")');
  if ((await page.$$('.album-cell.missing')).length !== 9 || (await page.$$('.album-cell.filled')).length) throw new Error('el filtro "Faltan" debía mostrar solo casillas vacías');
  await page.click('[data-testid=filtro-album] button:has-text("Tengo")');
  await page.waitForSelector('[data-testid=pagina-texto]:has-text("Página 1 de 1")');
  if ((await page.$$('.album-cell.filled')).length !== 3) throw new Error('el filtro "Tengo" debía mostrar 3 casillas');
  await page.click('[data-testid=filtro-album] button:has-text("Todas")');
  await page.click('[data-testid=btn-acciones]');
  await page.click('[data-testid=btn-precio-faltan]');
  await page.waitForFunction(() => /faltan S\//.test(document.querySelector('[data-testid=progreso-album]')?.textContent || ''));
  if (!/^3 \/ 207 · 1 % · S\/ /.test((await page.textContent('[data-testid=progreso-album]')).trim())) throw new Error('la fila compacta debía decir "3 / 207 · 1 % · S/ …": ' + await page.textContent('[data-testid=progreso-album]'));
  await foto(page, 'album-151');
  log('álbum 151:', total, 'cartas en 23 páginas,', faltan, 'faltan; filtros Tengo/Faltan y precio para completarlo');

  // ---------- álbum físico (Mejoras 3 · A: portada con color y marca de agua elegidos, vista previa en vivo)
  await page.goto(APP + '/app/album');
  // las portadas de los álbumes de colección intentan el logo oficial y, si no carga (aquí no hay internet), muestran símbolo + nombre
  await page.waitForSelector('[data-testid=album-coleccion] [data-testid=portada-coleccion]');
  await page.waitForSelector('[data-testid=album-coleccion] [data-testid=logo-texto]', { timeout: 20000 });
  const portadasCol = await page.$$eval('[data-testid=album-coleccion] [data-testid=portada-coleccion]', els => els.map(e => e.style.background || getComputedStyle(e).backgroundColor));
  if (!portadasCol.length || portadasCol.some(b => !b)) throw new Error('las portadas de colección debían tener un color suave: ' + JSON.stringify(portadasCol));
  if (await page.$('[data-testid=album-coleccion] .album-cover .thumb')) throw new Error('la portada ya no debía ser una carta recortada');
  await page.click('[data-testid=btn-nuevo-album]');
  await page.waitForSelector('.sheet [data-testid=portada-propia]');
  await page.fill('.sheet input.input >> nth=0', 'Carpeta azul');
  await page.fill('.sheet input[type=number] >> nth=0', '2');
  const coloresNuevo = await page.$$eval('.sheet [data-testid=colores-portada] button', els => els.map(e => e.getAttribute('aria-label').replace('Color ', '')));
  if (coloresNuevo.join(' ') !== '#E2571E #1F5FCC #1E8A57 #7C4DDB #C99A00 #D23B30 #1C2340 #0E7C86') throw new Error('colores de portada inesperados: ' + coloresNuevo.join(' '));
  const marcasNuevo = await page.$$eval('.sheet [data-testid=marcas-agua] button', els => els.map(e => e.textContent.trim()));
  if (marcasNuevo.join(' · ') !== 'Emblema PokéTCG · Llamas · Olas · Hojas · Rayos · Estrellas · Ninguna') throw new Error('marcas de agua inesperadas: ' + marcasNuevo.join(' · '));
  await page.click('.sheet [data-testid=color-1e8a57]');
  await page.click('.sheet [data-testid=marca-estrellas]');
  await page.waitForSelector('.sheet [data-testid=portada-propia][data-color="#1E8A57"][data-marca="estrellas"] .marca-patron');
  if ((await page.textContent('.sheet [data-testid=portada-propia]')) !== 'Carpeta azulVista previa de la portada') throw new Error('la vista previa no muestra el nombre');
  await foto(page, 'nuevo-album');
  await page.click('.sheet-foot >> text=Crear');
  await page.waitForURL(/\/app\/album\/p\//, { timeout: 20000 });
  if (sql("select color || '|' || marca_agua from public.albumes where nombre = 'Carpeta azul'") !== '#1E8A57|estrellas') throw new Error('el álbum no guardó color y marca de agua');
  // editar (Mejoras 4 · B: desde el menú Acciones del libro): cambiar a dorado (color claro → texto oscuro) y emblema; la tarjeta del álbum lo refleja
  await page.waitForSelector('[data-testid=hoja-carpeta]');
  await page.click('[data-testid=btn-acciones]');
  await page.click('[data-testid=btn-editar-album]');
  await page.waitForSelector('.sheet [data-testid=portada-propia][data-color="#1E8A57"]');
  await page.click('.sheet [data-testid=color-c99a00]');
  await page.click('.sheet [data-testid=marca-emblema]');
  await page.waitForSelector('.sheet [data-testid=portada-propia][data-color="#C99A00"][data-marca="emblema"] .marca-emblema');
  const colorTexto = await page.$eval('.sheet [data-testid=portada-propia] .nombre-portada', e => getComputedStyle(e).color);
  if (colorTexto !== 'rgb(28, 35, 64)') throw new Error('sobre dorado el texto debía ser oscuro: ' + colorTexto);
  await page.click('[data-testid=btn-guardar-album]');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.goto(APP + '/app/album');
  await page.waitForSelector('[data-testid=album-propio] [data-testid=portada-propia][data-color="#C99A00"][data-marca="emblema"]');
  // si la base aún no tiene las columnas (0008 sin pegar), crear un álbum sigue funcionando y queda con el color por defecto al reponerlas
  sql('alter table public.albumes drop column if exists color; alter table public.albumes drop column if exists marca_agua;');
  await page.click('[data-testid=btn-nuevo-album]');
  await page.fill('.sheet input.input >> nth=0', 'Sin columnas');
  await page.click('.sheet [data-testid=color-7c4ddb]');
  await page.click('.sheet-foot >> text=Crear');
  await page.waitForURL(/\/app\/album\/p\//, { timeout: 20000 });
  execSync('su postgres -c "psql -q -d poketcg_test -f supabase/migrations/0008_mejoras3.sql"');
  if (sql("select color || '|' || marca_agua from public.albumes where nombre = 'Sin columnas'") !== '#1F5FCC|emblema') throw new Error('el álbum creado sin columnas debía quedar con los valores por defecto');
  sql("delete from public.albumes where nombre = 'Sin columnas'");
  log('portadas: colección con color suave y logo (respaldo símbolo + nombre); álbum propio con color #1E8A57 + estrellas → editado a dorado con texto oscuro + emblema; sin columnas 0008 también se crea');
  await page.goto(APP + '/app/album');
  await page.click('[data-testid=album-propio]');
  await page.waitForURL(/\/app\/album\/p\//, { timeout: 20000 });
  // Mejoras 4 · B: el álbum propio es el mismo libro (hoja oscura, cuadrícula propia 3×3 como opción y por defecto, 2 páginas = 18 bolsillos,
  // + discreto en los vacíos, fila compacta "tengo / asignadas · S/ · faltan S/", Acciones con Rellenar / Editar / Eliminar)
  await page.waitForSelector('[data-testid=hoja-carpeta][data-cuadricula="3x3"] .pocket.vacio');
  if ((await page.$$('.pocket.vacio')).length !== 9 || (await page.$$('[data-testid=btn-mas-bolsillo]')).length !== 9 || !/Página 1 de 2/.test(await page.textContent('[data-testid=pagina-texto]'))) throw new Error('el álbum propio debía abrirse como libro con 9 bolsillos vacíos por página (2 páginas)');
  if ((await page.textContent('[data-testid=progreso-album]')).trim() !== '0 / 0 · S/ 0.00 · faltan S/ 0.00') throw new Error('fila compacta del álbum propio inesperada: ' + await page.textContent('[data-testid=progreso-album]'));
  await page.click('[data-testid=btn-acciones]');
  const accionesPropio = await page.$$eval('[data-testid=menu-acciones] [role=menuitem]', els => els.map(e => e.textContent.trim()));
  if (accionesPropio.join(' | ') !== 'Rellenar con una colección | Editar álbum | Eliminar álbum') throw new Error('Acciones del álbum propio inesperadas: ' + accionesPropio.join(' | '));
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=menu-acciones]', { state: 'detached' });
  await page.click('[data-testid=btn-mas-bolsillo] >> nth=0');
  await page.waitForSelector('.sheet .search-wrap input');
  await page.fill('.sheet .search-wrap input', 'charizard ex 151');
  await page.click('.sheet .card-row:has-text("006/165")');
  await page.waitForSelector('.pocket.filled');
  await page.click('[data-testid=btn-acciones]');
  await page.click('[data-testid=btn-rellenar-album]');
  await page.fill('.sheet input.input', 'Pokémon Card 151');
  await page.click('.set-item:has-text("SV2a")');
  await page.waitForFunction(() => document.querySelectorAll('.pocket.filled, .pocket.missing').length === 9, null, { timeout: 30000 });
  const bolsillos = await page.$$eval('.pocket', els => els.map(e => e.className.includes('filled') ? 'T' : e.className.includes('missing') ? 'F' : '.'));
  if (bolsillos.join('') !== 'TFFFFFFFF') throw new Error('bolsillos inesperados: ' + bolsillos.join(''));
  const filaPropio = (await page.textContent('[data-testid=progreso-album]')).trim();
  const tengoPropio = parseInt((filaPropio.match(/^(\d+) \/ 18 · S\/ .* · faltan S\/ /) || [])[1], 10);
  if (!(tengoPropio >= 1)) throw new Error('fila compacta tras rellenar inesperada: ' + filaPropio);
  await foto(page, 'album-fisico');
  // mover bolsillo 1 → 5 tocando (menú del bolsillo lleno)
  await page.click('.pocket >> nth=0');
  await page.click('text=Mover a otro bolsillo');
  await page.click('.pocket >> nth=4');
  await page.waitForFunction(() => document.querySelectorAll('.pocket')[4].className.includes('filled') && document.querySelectorAll('.pocket')[0].className.includes('missing'));
  // página 2 con la flecha y filtro Faltan (solo los bolsillos asignados sin tener)
  await page.click('[data-testid=pagina-siguiente]');
  await page.waitForSelector('[data-testid=pagina-texto]:has-text("Página 2 de 2")');
  if ((await page.$$('.pocket.filled, .pocket.missing')).length !== 9) throw new Error('la página 2 debía tener 9 bolsillos asignados');
  await page.click('[data-testid=filtro-album] button:has-text("Faltan")');
  await page.waitForSelector(`[data-testid=pagina-texto]:has-text("Página 1 de ${Math.ceil((18 - tengoPropio) / 9)}")`);
  if ((await page.$$('.pocket.missing')).length !== Math.min(9, 18 - tengoPropio) || (await page.$('.pocket.filled'))) throw new Error('el filtro Faltan debía mostrar solo bolsillos sin tener');
  await page.click('[data-testid=filtro-album] button:has-text("Todos")');
  await page.waitForSelector('.pocket.filled');
  const casillas = parseInt(sql('select count(*) from public.album_casillas'), 10);
  log('álbum propio como libro: 18 bolsillos (3×3 propia, 2 páginas),', casillas, 'asignados, + en los vacíos, Acciones (Rellenar / Editar / Eliminar), fila compacta, movimiento 1 → 5 y filtro Faltan OK');


  // ---------- Mejoras 4 · C: Pokédex (álbum virtual, una casilla por especie en orden nacional; primero en la lista)
  await page.goto(APP + '/app/album');
  await page.waitForSelector('[data-testid=album-pokedex]');
  if ((await page.$eval('.album-grid > a:first-child', e => e.dataset.testid)) !== 'album-pokedex') throw new Error('la Pokédex debía ser el primer álbum de la lista');
  const especiesChris = num(`select count(distinct d) from public.entradas e join public.cartas c on c.id = e.carta_id, unnest(c.dex) d where e.usuario_id = '${CHRIS}'`);
  const especiesGen1 = num(`select count(distinct d) from public.entradas e join public.cartas c on c.id = e.carta_id, unnest(c.dex) d where e.usuario_id = '${CHRIS}' and d <= 151`);
  if ((await page.textContent('[data-testid=album-pokedex] .album-foot-card span:first-child')).trim() !== `${especiesChris} / 1025`) throw new Error('la tarjeta Pokédex debía decir "' + especiesChris + ' / 1025": ' + await page.textContent('[data-testid=album-pokedex] .album-foot-card'));
  await page.click('[data-testid=album-pokedex]');
  await page.waitForURL(/\/app\/album\/pokedex/);
  await page.waitForSelector('[data-testid=hoja-carpeta] [data-testid=dex-tengo][data-dex="1"]');
  const dexs = await page.$$eval('[data-testid=hoja-carpeta] .pocket', els => els.map(e => e.dataset.dex));
  if (dexs.join(',') !== '1,2,3,4,5,6,7,8,9' || !/Página 1 de 114/.test(await page.textContent('[data-testid=pagina-texto]'))) throw new Error('la Pokédex debía empezar en 0001 en orden nacional (3×3 = 114 páginas): ' + dexs.join(','));
  if (!(await page.$('[data-testid=dex-falta][data-dex="2"]')) || (await page.textContent('[data-testid=dex-falta][data-dex="2"] .pocket-n')).trim() !== '0002' || !(await page.$('[data-testid=dex-falta][data-dex="2"] .thumb'))) throw new Error('la 0002 (Ivysaur) debía faltar, en gris, con su número de Pokédex y una carta del catálogo');
  const filaDex = (await page.textContent('[data-testid=progreso-album]')).trim();
  if (!new RegExp(`^${especiesChris} / 1025 · ${Math.round(100 * especiesChris / 1025)} % · S/ `).test(filaDex)) throw new Error('fila compacta de la Pokédex inesperada: ' + filaDex);
  await foto(page, 'pokedex');
  // casilla 0001: mi carta más valiosa de Bulbasaur → "Elegir otra carta para esta casilla" lista todas mis copias de la especie
  await page.click('[data-testid=dex-tengo][data-dex="1"]');
  await page.waitForSelector('.sheet [data-testid=dex-elegir-otra]');
  if (!/Bulbasaur/.test(await page.textContent('.sheet .card-name')) || !/más valiosa/.test(await page.textContent('.sheet .card-main'))) throw new Error('la casilla 0001 debía mostrar mi Bulbasaur más valioso: ' + await page.textContent('.sheet .card-main'));
  await page.click('.sheet [data-testid=dex-elegir-otra]');
  await page.waitForSelector('.sheet [data-testid=dex-opcion]');
  const copiasBulb = num(`select count(*) from public.entradas e join public.cartas c on c.id = e.carta_id where e.usuario_id = '${CHRIS}' and 1 = any(c.dex)`);
  const nOpciones = (await page.$$('.sheet [data-testid=dex-opcion]')).length;
  if (nOpciones !== copiasBulb || !(await page.$('.sheet [data-testid=dex-opcion][aria-pressed=true]'))) throw new Error(`debía listar mis ${copiasBulb} copias de Bulbasaur con la actual marcada: ${nOpciones}`);
  const noActual = await page.$('.sheet [data-testid=dex-opcion][aria-pressed=false]');
  if (!noActual) throw new Error('debía haber otra copia que elegir');
  await noActual.click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  for (let i = 0; i < 20 && num(`select count(*) from public.pokedex_elecciones where usuario_id = '${CHRIS}' and dex = 1`) !== 1; i++) await page.waitForTimeout(250);
  if (num(`select count(*) from public.pokedex_elecciones where usuario_id = '${CHRIS}' and dex = 1`) !== 1) throw new Error('la elección no se guardó en pokedex_elecciones');
  await page.click('[data-testid=dex-tengo][data-dex="1"]');
  await page.waitForSelector('.sheet [data-testid=dex-usar-valiosa]');
  if (!/Carta elegida/.test(await page.textContent('.sheet .card-main'))) throw new Error('la casilla debía indicar que la carta fue elegida a mano');
  await page.click('.sheet [data-testid=dex-usar-valiosa]');
  await page.waitForSelector('.sheet', { state: 'detached' });
  for (let i = 0; i < 20 && num(`select count(*) from public.pokedex_elecciones where usuario_id = '${CHRIS}'`) !== 0; i++) await page.waitForTimeout(250);
  if (num(`select count(*) from public.pokedex_elecciones where usuario_id = '${CHRIS}'`) !== 0) throw new Error('"Volver a la más valiosa" debía borrar la elección');
  // filtros: generación 2 empieza en 0152; tipo Fuego (Charmander primero, sin Bulbasaur); Tengo (solo las que tengo de la gen. 1)
  await page.selectOption('[data-testid=filtro-generacion]', '2');
  await page.waitForSelector('[data-testid=hoja-carpeta] .pocket[data-dex="152"]');
  if ((await page.$$eval('[data-testid=hoja-carpeta] .pocket', els => els.map(e => e.dataset.dex)))[0] !== '152' || !/de 12/.test(await page.textContent('[data-testid=pagina-texto]'))) throw new Error('la generación 2 debía empezar en 0152 (100 especies = 12 páginas)');
  await page.selectOption('[data-testid=filtro-generacion]', '1');
  await page.selectOption('[data-testid=filtro-tipo]', 'Fire');
  await page.waitForSelector('[data-testid=hoja-carpeta] .pocket[data-dex="4"]');
  const fuego = await page.$$eval('[data-testid=hoja-carpeta] .pocket', els => els.map(e => e.dataset.dex));
  if (fuego[0] !== '4' || fuego.includes('1') || fuego.includes('7')) throw new Error('tipo Fuego debía empezar en Charmander, sin Bulbasaur ni Squirtle: ' + fuego.join(','));
  await page.selectOption('[data-testid=filtro-tipo]', '');
  await page.click('[data-testid=filtro-album] button:has-text("Tengo")');
  await page.waitForFunction(n => document.querySelectorAll('[data-testid=dex-tengo]').length === n && !document.querySelector('[data-testid=dex-falta]'), especiesGen1);
  await page.click('[data-testid=filtro-album] button:has-text("Todas")');
  await page.waitForSelector('[data-testid=dex-falta][data-dex="2"]');
  // una especie que falta: "Buscar en el mercado" por su nombre
  await page.click('[data-testid=dex-falta][data-dex="2"]');
  await page.waitForSelector('.sheet [data-testid=dex-ver-mercado]');
  if (!/\/app\/mercado\?q=Ivysaur/.test(await page.getAttribute('.sheet [data-testid=dex-ver-mercado]', 'href'))) throw new Error('la especie que falta debía llevar al mercado por su nombre');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  // ocultar (no se puede borrar) y volver a mostrar desde la lista
  await page.click('[data-testid=btn-acciones]');
  await page.click('[data-testid=btn-ocultar-pokedex]');
  await page.waitForURL(/\/app\/album$/);
  await page.waitForSelector('[data-testid=btn-mostrar-pokedex]');
  if (await page.$('[data-testid=album-pokedex]')) throw new Error('la Pokédex oculta no debía salir en la lista');
  for (let i = 0; i < 20 && sql(`select pokedex_oculto from public.perfiles where id = '${CHRIS}'`) !== 't'; i++) await page.waitForTimeout(250);
  if (sql(`select pokedex_oculto from public.perfiles where id = '${CHRIS}'`) !== 't') throw new Error('pokedex_oculto debía guardarse en el perfil');
  await page.click('[data-testid=btn-mostrar-pokedex]');
  await page.waitForSelector('[data-testid=album-pokedex]');
  log('Pokédex: primera en la lista (' + especiesChris + ' / 1025), orden nacional, carta más valiosa por especie, "Elegir otra carta" guardado y revertido, filtros generación/tipo/Tengo, falta → mercado, ocultar y mostrar');

  // ---------- Mejoras 4 · D: filtros y búsqueda en el Mercado (celular: hoja "Filtros · N"; PC: panel plegable a la izquierda)
  await page.goto(APP + '/app/mercado/buscar');
  await page.waitForSelector('[data-testid=btn-filtros]');
  await page.waitForSelector('[data-testid=fila-mercado]');
  if (await page.$('[data-testid=panel-filtros]')) throw new Error('en el celular los filtros van en una hoja, no en un panel');
  await page.click('[data-testid=btn-filtros]');
  await page.waitForSelector('.sheet [data-testid=formulario-filtros]');
  await page.fill('.sheet [data-testid=buscar-coleccion]', '151');
  await page.click('.sheet [data-testid=opcion-coleccion]:has-text("151") >> nth=0');
  await page.waitForSelector('.sheet [data-testid=quitar-coleccion]');
  await page.selectOption('.sheet [data-testid=filtro-tipo]', 'Grass');
  await page.waitForSelector('.sheet-head h3:has-text("Filtros · 2")');
  await page.click('[data-testid=btn-ver-resultados]');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.waitForURL(/coleccion=sv03\.5&tipo=Grass/);
  const chipsMercado = await page.$$eval('[data-testid=chips-filtros] .chip-filtro', els => els.map(e => e.textContent.trim()));
  if (chipsMercado.join(' | ') !== '151 | Planta' || !/Filtros · 2/.test(await page.textContent('[data-testid=btn-filtros]'))) throw new Error('chips de filtros inesperados: ' + chipsMercado.join(' | '));
  const enVentaPlanta = num(`select count(distinct m.carta_id) from public.mercado m join public.cartas c on c.id = m.carta_id where c.coleccion_id = 'sv03.5' and 'Grass' = any(c.tipos)`);
  if (!enVentaPlanta) throw new Error('la prueba necesita cartas Planta de 151 en venta');
  await page.waitForFunction(n => document.querySelectorAll('[data-testid=fila-mercado]').length === n, enVentaPlanta);
  const idsPlanta = await page.$$eval('[data-testid=fila-mercado]', els => els.map(e => e.dataset.carta));
  const planta = new Set(sql(`select id from public.cartas where coleccion_id = 'sv03.5' and 'Grass' = any(tipos)`).split('\n'));
  if (!idsPlanta.every(id => planta.has(id))) throw new Error('con colección 151 + tipo Planta salieron otras cartas: ' + idsPlanta.join(','));
  await foto(page, 'mercado-filtros');
  // quitar un chip y "Limpiar todo" actualizan la dirección
  await page.click('[data-testid=chip-tipo]');
  await page.waitForURL(u => /coleccion=sv03\.5/.test(u.href) && !/tipo=/.test(u.href));
  await page.click('[data-testid=btn-limpiar-filtros]');
  await page.waitForURL(u => !/coleccion=/.test(u.href));
  await page.waitForSelector('[data-testid=chips-filtros]', { state: 'detached' });
  // orden: menor precio (precios no decrecientes) y nombre (como la base: por nombre en inglés)
  await page.selectOption('[data-testid=orden-mercado]', 'precio');
  await page.waitForURL(/orden=precio/);
  await page.waitForTimeout(600);
  const preciosOrden = await page.$$eval('[data-testid=fila-mercado] .price', els => els.map(e => parseFloat(e.textContent.replace(/[^\d.]/g, ''))));
  if (preciosOrden.length < 2 || preciosOrden.some((p, i) => i && p < preciosOrden[i - 1])) throw new Error('orden por menor precio inesperado: ' + preciosOrden.join(', '));
  await page.selectOption('[data-testid=orden-mercado]', 'nombre');
  await page.waitForURL(/orden=nombre/);
  const idsNombreDb = sql(`select carta_id from public.mercado_resumen(null, '', '', '', '', null, null, 'nombre', 40, 0, '', '', '', false, false)`).split('\n');
  await page.waitForFunction(ids => JSON.stringify([...document.querySelectorAll('[data-testid=fila-mercado]')].map(e => e.dataset.carta)) === JSON.stringify(ids), idsNombreDb);
  await page.selectOption('[data-testid=orden-mercado]', 'novedad');
  await page.waitForURL(u => !/orden=/.test(u.href));
  // precio mínimo escrito a mano: todas las filas desde ese precio
  await page.click('[data-testid=btn-filtros]');
  await page.fill('.sheet [data-testid=precio-min]', '11');
  await page.waitForSelector('.sheet-head h3:has-text("Filtros · 1")');
  await page.click('[data-testid=btn-ver-resultados]');
  await page.waitForURL(/min=11/);
  await page.waitForTimeout(600);
  const desde11 = await page.$$eval('[data-testid=fila-mercado] .price', els => els.map(e => parseFloat(e.textContent.replace(/[^\d.]/g, ''))));
  if (desde11.some(p => p < 11) || (await page.textContent('[data-testid=chip-precio]')).trim() !== 'desde S/ 11') throw new Error('precio mínimo 11 inesperado: ' + desde11.join(', ') + ' · ' + await page.textContent('[data-testid=chip-precio]'));
  await page.click('[data-testid=chip-precio]');
  await page.waitForURL(u => !/min=/.test(u.href));
  // vendedor con buena reputación y con foto real: mismas filas que la función de la base
  for (const [testid, param, nombreF] of [['filtro-reputacion', 'reputacion', 'p_reputacion'], ['filtro-foto', 'foto', 'p_con_foto']]) {
    const esperadas = num(`select count(*) from public.mercado_resumen(null, '', '', '', '', null, null, 'novedad', 500, 0, '', '', '', ${nombreF === 'p_con_foto'}, ${nombreF === 'p_reputacion'})`);
    await page.click('[data-testid=btn-filtros]');
    await page.check(`.sheet [data-testid=${testid}]`);
    await page.click('[data-testid=btn-ver-resultados]');
    await page.waitForURL(new RegExp(param + '=1'));
    await page.waitForTimeout(700);
    const filasF = (await page.$$('[data-testid=fila-mercado]')).length;
    if (filasF !== esperadas) throw new Error(`${param}: ${filasF} filas, la base dice ${esperadas}`);
    await page.click('[data-testid=btn-limpiar-filtros]');
    await page.waitForURL(u => !new RegExp(param + '=').test(u.href));
  }
  // búsqueda tolerante a errores: "charisard" → ¿Quisiste decir Charizard?; sugerencias al escribir "pika"
  await page.fill('[data-testid=buscar-mercado]', 'charisard');
  await page.waitForSelector('[data-testid=quisiste-decir]:has-text("Charizard")');
  await page.click('[data-testid=btn-quisiste-decir]');
  await page.waitForURL(/q=Charizard/);
  if ((await page.inputValue('[data-testid=buscar-mercado]')) !== 'Charizard') throw new Error('"¿Quisiste decir?" debía poner Charizard en el buscador');
  await page.fill('[data-testid=buscar-mercado]', 'pika');
  await page.waitForSelector('[data-testid=sugerencias] [data-testid=sugerencia-carta]:has-text("Pikachu")');
  await foto(page, 'mercado-sugerencias');
  await page.click('[data-testid=sugerencias] [data-testid=sugerencia-carta]:has-text("Pikachu") >> nth=0');
  await page.waitForURL(/q=Pikachu/);
  await page.waitForSelector('[data-testid=sugerencias]', { state: 'detached' });
  // colección sugerida desde el buscador de arriba del Mercado (celular): lleva al mercado con ?coleccion=
  await page.goto(APP + '/app/mercado');
  await page.fill('[data-testid=mercado-inicio-buscar]', 'obsid');
  await page.waitForSelector('[data-testid=sugerencia-coleccion]:has-text("Obsidian")');
  await page.click('[data-testid=sugerencia-coleccion]:has-text("Obsidian") >> nth=0');
  await page.waitForURL(/\/app\/mercado\/buscar\?coleccion=sv03$/);
  await page.waitForSelector('[data-testid=chip-coleccion]');
  log('Mercado (celular): hoja Filtros · N (colección con buscador, tipo), chips quitables y Limpiar todo en la dirección, orden precio/nombre, precio mínimo, reputación y foto como la base, "¿Quisiste decir Charizard?", sugerencias (Pikachu, colección Obsidian)');
  // PC: panel de filtros a la izquierda, plegable (se recuerda), y sugerencias en el buscador de la barra superior
  {
    const ctxPcF = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE' });
    const pcF = await ctxPcF.newPage();
    await entrar(pcF, 'chris_tcg', process.env.CLAVE_CHRIS || 'clave12345');
    await pcF.goto(APP + '/app/mercado/buscar?coleccion=sv03.5');
    await pcF.waitForSelector('[data-testid=panel-filtros] [data-testid=quitar-coleccion]');
    const geoPanel = await pcF.evaluate(() => { const p = document.querySelector('[data-testid=panel-filtros]').getBoundingClientRect(); const r = document.querySelector('[data-testid=resultados-mercado]').getBoundingClientRect(); return { panelIzq: Math.round(p.left), panelAncho: Math.round(p.width), resultadosIzq: Math.round(r.left) }; });
    if (geoPanel.panelAncho < 240 || geoPanel.resultadosIzq < geoPanel.panelIzq + geoPanel.panelAncho) throw new Error('PC: el panel de filtros debía ir a la izquierda de los resultados: ' + JSON.stringify(geoPanel));
    if (await pcF.$('[data-testid=btn-filtros]')) throw new Error('PC: con el panel abierto no hace falta el botón Filtros');
    await foto(pcF, 'pc-mercado-filtros');
    await pcF.click('[data-testid=btn-plegar-filtros]');
    await pcF.waitForSelector('[data-testid=panel-filtros]', { state: 'detached' });
    await pcF.waitForSelector('[data-testid=btn-filtros]:has-text("Filtros · 1")');
    await pcF.reload();
    await pcF.waitForSelector('[data-testid=btn-filtros]:has-text("Filtros · 1")');
    if (await pcF.$('[data-testid=panel-filtros]')) throw new Error('PC: el panel plegado debía recordarse al recargar');
    await pcF.click('[data-testid=btn-filtros]');
    await pcF.waitForSelector('[data-testid=panel-filtros]');
    await pcF.fill('[data-testid=buscador-pc] input', 'charisard');
    await pcF.press('[data-testid=buscador-pc] input', 'Enter');
    await pcF.waitForURL(/q=charisard/);
    await pcF.waitForSelector('[data-testid=quisiste-decir]:has-text("Charizard")');
    await pcF.fill('[data-testid=buscador-pc] input', 'mitsuhiro');
    await pcF.waitForSelector('[data-testid=buscador-pc] [data-testid=sugerencia-ilustrador]:has-text("Mitsuhiro Arita")');
    await pcF.click('[data-testid=buscador-pc] [data-testid=sugerencia-ilustrador]:has-text("Mitsuhiro Arita")');
    await pcF.waitForURL(/\/app\/mercado\/buscar\?ilustrador=Mitsuhiro(%20|\+)Arita/);
    await pcF.waitForSelector('[data-testid=chip-ilustrador]:has-text("Mitsuhiro Arita")');
    await ctxPcF.close();
  }
  log('Mercado (PC): panel de filtros a la izquierda, plegable y recordado; "¿Quisiste decir?" y sugerencia de ilustrador desde la barra superior');

  // ---------- Mejoras 4 · E: búsqueda general en Mi Colección (En tu colección / Otras cartas, filtros + Dónde + En venta) y filtros del Bulk
  await page.goto(APP + '/app/buscar?q=charisard');
  await page.waitForSelector('[data-testid=quisiste-decir]:has-text("Charizard")');
  await page.click('[data-testid=btn-quisiste-decir]');
  await page.waitForURL(/\/app\/buscar\?q=Charizard/);
  await page.waitForSelector('[data-testid=grupo-propias] .card-row');
  const propiasChar = await page.$$eval('[data-testid=grupo-propias] .card-row [data-testid=donde-la-tengo]', els => els.map(e => e.textContent));
  const charizardsDb = num(`select count(distinct e.carta_id) from public.entradas e join public.cartas c on c.id = e.carta_id where e.usuario_id = '${CHRIS}' and c.nombre ilike '%charizard%'`);
  if (propiasChar.length !== charizardsDb || !propiasChar.every(t => /Bulk|Álbum/.test(t))) throw new Error(`"En tu colección" debía listar mis ${charizardsDb} Charizard con su ubicación: ` + JSON.stringify(propiasChar));
  const otrasChar = await page.$$('[data-testid=grupo-otras] .card-row:has-text("Todavía no la tienes") [data-testid=btn-ver-mercado]');
  if (!otrasChar.length || !(await page.$('[data-testid=grupo-otras] .card-row [data-testid=btn-guardar-fila]'))) throw new Error('"Otras cartas" debía listar Charizard del catálogo con Agregar y Ver en el mercado');
  await foto(page, 'buscar-grupos');
  // filtros: Dónde = Bulk (todas mis copias de Charizard están en Bulk) y Dónde = álbum (ninguna)
  await page.click('[data-testid=btn-filtros]');
  await page.selectOption('.sheet [data-testid=filtro-donde]', 'bulk');
  await page.click('[data-testid=btn-ver-resultados]');
  await page.waitForURL(/donde=bulk/);
  const enBulk = num(`select count(distinct e.carta_id) from public.entradas e join public.cartas c on c.id = e.carta_id where e.usuario_id = '${CHRIS}' and c.nombre ilike '%charizard%' and e.caja_id is not null`);
  await page.waitForFunction(n => document.querySelectorAll('[data-testid=grupo-propias] .card-row').length === n, enBulk);
  await page.click('[data-testid=chip-donde]');
  await page.waitForURL(u => !/donde=/.test(u.href));
  await page.click('[data-testid=btn-filtros]');
  await page.selectOption('.sheet [data-testid=filtro-venta]', 'si');
  await page.click('[data-testid=btn-ver-resultados]');
  await page.waitForURL(/venta=si/);
  const charEnVenta = num(`select count(distinct e.carta_id) from public.entradas e join public.cartas c on c.id = e.carta_id join public.publicaciones p on p.entrada_id = e.id and p.estado in ('activa', 'pausada', 'reservada') where e.usuario_id = '${CHRIS}' and c.nombre ilike '%charizard%'`);
  await page.waitForFunction(n => document.querySelectorAll('[data-testid=grupo-propias] .card-row').length === n, charEnVenta);
  // solo filtros, sin texto: lista mis cartas que cumplen (colección 151) sin "Otras cartas"
  await page.goto(APP + '/app/buscar?coleccion=sv03.5');
  await page.waitForSelector('[data-testid=grupo-propias] .card-row');
  const distintas151 = num(`select count(distinct carta_id) from public.entradas where usuario_id = '${CHRIS}' and carta_id like 'sv03.5-%'`);
  if ((await page.$$('[data-testid=grupo-propias] .card-row')).length !== distintas151 || (await page.$('[data-testid=grupo-otras]'))) throw new Error('con solo el filtro de colección debía listar mis ' + distintas151 + ' cartas de 151, sin "Otras cartas"');
  // Bulk: Filtros · N (en venta) y orden por precio
  const bulkConPubs = sql(`select e.caja_id from public.entradas e join public.publicaciones p on p.entrada_id = e.id and p.estado in ('activa', 'pausada') where e.usuario_id = '${CHRIS}' and e.caja_id is not null group by e.caja_id order by count(*) desc limit 1`);
  await page.goto(APP + '/app/bulk/' + bulkConPubs);
  await page.waitForSelector('[data-testid=filtros-bulk] [data-testid=btn-filtros]');
  const totalBulk = num(`select count(*) from public.entradas where caja_id = '${bulkConPubs}'`);
  const enVentaBulk = num(`select count(*) from public.entradas e join public.publicaciones p on p.entrada_id = e.id and p.estado in ('activa', 'pausada', 'reservada') where e.caja_id = '${bulkConPubs}'`);
  await page.click('[data-testid=filtros-bulk] [data-testid=btn-filtros]');
  await page.selectOption('.sheet [data-testid=filtro-venta]', 'si');
  await page.waitForSelector('.sheet-head h3:has-text("Filtros · 1")');
  await page.click('[data-testid=btn-ver-resultados]');
  await page.waitForSelector(`[data-testid=cuenta-bulk]:has-text("${enVentaBulk} de ${totalBulk}")`);
  if ((await page.$$('.entry-row')).length !== enVentaBulk || (await page.textContent('[data-testid=chips-filtros]')).indexOf('En venta') < 0) throw new Error('el filtro En venta del Bulk no coincide');
  await page.selectOption('[data-testid=orden-bulk]', 'precio');
  await page.waitForTimeout(400);
  const preciosBulk = await page.$$eval('.entry-row .card-side', els => els.map(e => parseFloat((e.textContent.match(/S\/\s*([\d.,]+)/) || [])[1]?.replace(',', '') || '0')));
  if (preciosBulk.some((p, i) => i && p > preciosBulk[i - 1])) throw new Error('orden por precio del Bulk inesperado: ' + preciosBulk.join(', '));
  await page.click('[data-testid=btn-limpiar-filtros]');
  await page.waitForSelector('[data-testid=chips-filtros]', { state: 'detached' });
  await foto(page, 'bulk-filtros');
  log('Mi Colección: "¿Quisiste decir Charizard?", En tu colección (' + charizardsDb + ' con ubicación) y Otras cartas; filtros Dónde y En venta; solo filtros lista mis ' + distintas151 + ' de 151; Bulk con Filtros · 1 (en venta: ' + enVentaBulk + ' de ' + totalBulk + ') y orden por precio');

  // ---------- Mejoras 4 · F: textos cortos: en 360, 768, 1024 y 1280 px ningún rótulo, botón o título se parte en 3 líneas, se corta ni desborda
  {
    const albumPropioF = sql(`select id from public.albumes where usuario_id = '${CHRIS}' order by creado_en limit 1`);
    const bulkF = sql(`select id from public.cajas where usuario_id = '${CHRIS}' order by orden limit 1`);
    const RUTAS_TEXTOS = ['/app/album', '/app/album/sv03.5', '/app/album/pokedex', `/app/album/p/${albumPropioF}`, '/app/bulk', `/app/bulk/${bulkF}`, '/app/mazos', '/app/buscar?q=pikachu', '/app/buscar', '/app/mercado', '/app/mercado/buscar?coleccion=sv03.5&tipo=Grass', '/app/carrito', '/app/compras', '/app/ventas', '/app/notificaciones', '/app/ajustes', '/app/carta/sv03.5-001', '/ayuda', '/tiendas', '/'];
    const revisarTextos = () => {
      const SEL = 'button, .btn, label, .pill, .chip, .chipbtn, .chip-filtro, th, h1, h2, h3, h4, .seg button, .subtabs a, .tabs a, .tabbar a, .stat .box span, .stat .box b, .card-name, .card-set, .texto-pagina, .lateral-menu a, .box-card .box-name, .album-title .nombre, .set-header, .field > label, .libro-resumen, select, .menu a, .menu button, .precio-grande, .titulo-pestana, .brand-name, .count, .cifra, .pocket-n, .loc';
      const problemas = [];
      const vistos = new Set();
      const enScrollHorizontal = el => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
      const lineasDe = el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const tops = [];
        for (const r of range.getClientRects()) { if (r.width < 1 || r.height < 1) continue; if (!tops.some(t => Math.abs(t - r.top) < r.height * 0.6)) tops.push(r.top); }
        return tops.length;
      };
      for (const el of document.querySelectorAll(SEL)) {
        if (el.closest('.sugerencias, .thumb-texto, .pocket, .sheet-backdrop, [aria-hidden="true"], .fondo-app, textarea, .ayuda-globo, .fondo-opcion, [data-testid=notificacion], .carrusel, .set-item, .carrusel')) continue;
        if (el.querySelector('div, p, ul, table, h1, h2, h3, h4, img')) continue;   // compuestos (tarjetas enteras): se revisan sus hijos
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const texto = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!texto || texto.length > 90) continue;
        const lineas = lineasDe(el);
        const cortado = el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'visible';
        const desborde = !enScrollHorizontal(el) && r.right > innerWidth + 1;
        const clave = texto.slice(0, 40) + '|' + (lineas >= 3 ? 'L' : '') + (cortado ? 'C' : '') + (desborde ? 'D' : '');
        if ((lineas >= 3 || cortado || desborde) && !vistos.has(clave)) { vistos.add(clave); problemas.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').filter(Boolean).slice(0, 2).join('.')} "${texto.slice(0, 60)}" → ${lineas >= 3 ? lineas + ' líneas ' : ''}${cortado ? 'cortado ' : ''}${desborde ? 'desborda ' : ''}(${Math.round(r.width)}×${Math.round(r.height)})`); }
      }
      if (document.documentElement.scrollWidth > innerWidth + 1) problemas.push(`página con desplazamiento horizontal: ${document.documentElement.scrollWidth} > ${innerWidth}`);
      return problemas;
    };
    const fallas = [];
    for (const w of [360, 768, 1024, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const ruta of RUTAS_TEXTOS) {
        await page.goto(APP + ruta);
        await page.waitForTimeout(700);
        const p = await page.evaluate(revisarTextos);
        if (p.length) fallas.push(`[${w}] ${ruta}\n  ` + p.join('\n  '));
      }
    }
    await page.setViewportSize({ width: 420, height: 860 });
    if (fallas.length) throw new Error('textos cortados, desbordados o en 3 líneas:\n' + fallas.join('\n'));
    log('textos: ' + RUTAS_TEXTOS.length + ' pantallas en 360, 768, 1024 y 1280 px sin rótulos ni botones partidos en 3 líneas, cortados o desbordados');
  }

  // ---------- Fase 2 · E: huellas compartidas (otro usuario ya preparó la colección 151 → se descarga en segundos)
  {
    const idsMew = sql("select id from public.cartas where coleccion_id = 'sv03.5' and not sin_datos order by numero_orden").split('\n').filter(Boolean);
    const SIG_LEN = 1456, SIG_V = 2;
    const cab = Buffer.from(JSON.stringify({ v: SIG_V, set: 'sv03.5', sigLen: SIG_LEN, ids: idsMew, count: idsMew.length, total: idsMew.length, ts: Date.now() }));
    const archivo = Buffer.alloc(8 + cab.length + idsMew.length * SIG_LEN);
    archivo.write('PKH1', 0); archivo.writeUInt32BE(cab.length, 4); cab.copy(archivo, 8);
    for (let i = 0; i < idsMew.length; i++) archivo.fill((i * 7) % 251 + 1, 8 + cab.length + i * SIG_LEN, 8 + cab.length + (i + 1) * SIG_LEN);
    const subida = await fetch(MOCK + '/storage/v1/object/huellas/v2/sv03.5.bin', { method: 'POST', headers: { Authorization: 'Bearer service-de-prueba', 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }, body: archivo });
    if (!subida.ok) throw new Error('no se pudo subir el archivo de huellas compartidas: ' + subida.status);
    await page.goto(APP + '/app/ajustes');
    await page.waitForSelector('#reconocimiento .set-item', { timeout: 60000 });
    await page.fill('#reconocimiento input[placeholder="Filtrar colecciones…"]', '151');
    await page.check('#reconocimiento .set-item:has-text("151") input[type=checkbox] >> nth=0');
    await page.click('#reconocimiento button:has-text("Preparar seleccionadas")');
    await page.waitForSelector('.toast:has-text("1 descargadas de la red")', { timeout: 60000 });
    await page.waitForSelector(`#reconocimiento .set-item.done:has-text("Preparada: ${idsMew.length} de ${idsMew.length}")`, { timeout: 15000 });
    await foto(page, 'huellas-compartidas');
    log(`huellas compartidas: colección 151 preparada desde la red (${idsMew.length} huellas) sin calcular nada`);
  }
  // ---------- ajustes: perfil e importación v1
  await page.goto(APP + '/app/ajustes');
  await page.fill('#main input.input >> nth=0', 'Christian G.');
  await page.click('text=Guardar perfil');
  await page.waitForSelector('.toast:has-text("Perfil guardado")');
  const respaldo = { app: 'pokeboveda', v: 1, state: { boxes: [{ id: 'b1', name: 'Bulk 1', order: 1, mode: 'auto' }, { id: 'b2', name: 'Caja vieja', order: 2, mode: 'manual' }], entries: [
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
  if (nCajas !== 3 || nEnt !== 14) throw new Error(`importación: ${nCajas} cajas, ${nEnt} entradas (${resImp})`);   // 5 propias + 3 compradas + 2 nuevas al repartir (Bulbasaur ES y repetidas de Charmander) + 4 importadas
  await foto(page, 'ajustes');
  log('importación v1:', resImp.trim());

  // exportar JSON
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('text=Exportar respaldo (.json)')]);
  const exportado = JSON.parse(fs.readFileSync(await descarga.path(), 'utf8'));
  if (exportado.entradas.length !== 14) throw new Error('exportación incompleta: ' + exportado.entradas.length);
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
  await page.waitForURL(/\/app\/album/, { timeout: 20000 });   // la app abre en Mi Colección → Álbumes
  await page.waitForSelector('text=Mis álbumes', { timeout: 60000 });
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
  await page.goto(APP + '/app/buscar');
  await page.waitForSelector('text=precio estimado', { timeout: 60000 });
  await foto(page, 'escritorio');

  // ---------- Fase 2 · E: service worker registrado y página sin conexión
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, activo: !!r.active }; });
  if (!sw.activo || !/\/$/.test(sw.scope)) throw new Error('service worker no activo: ' + JSON.stringify(sw));
  await page.waitForFunction(async () => (await caches.keys()).some(k => k.includes('poketcg')), null, { timeout: 15000 });
  await page.reload();
  await page.waitForSelector('text=precio estimado', { timeout: 60000 });
  // (Playwright no puede simular "sin conexión" para el service worker: se comprueba lo que quedó en caché)
  const cacheado = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) out.push(new URL(r.url).pathname); } return out; });
  if (!cacheado.includes('/sin-conexion.html') || !cacheado.some(p => p.startsWith('/_next/static/')) || !cacheado.includes('/data/catalogo.json')) throw new Error('la caché del service worker está incompleta: ' + cacheado.slice(0, 10).join(', '));
  const sinConexion = await page.evaluate(async () => (await (await caches.match('/sin-conexion.html')).text()).includes('Sin conexión'));
  if (!sinConexion) throw new Error('la página sin conexión no está en caché');
  log('service worker activo: caché de la app, el catálogo y la página sin conexión (' + cacheado.length + ' archivos)');

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
