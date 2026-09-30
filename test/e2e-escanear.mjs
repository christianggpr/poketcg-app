#!/usr/bin/env node
/**
 * Prueba del escáner (subir foto → recorte → OCR → candidatas → guardar) contra la app local y el
 * Supabase simulado. Requiere que test/e2e.mjs haya creado la cuenta chris_tcg.
 *   node test/e2e-escanear.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.PLAYWRIGHT_MODULES || '/opt/node-tools/node_modules/');
const { chromium } = require('playwright');

const APP = 'http://127.0.0.1:3000';
const FOTO = process.env.FOTO || '/home/claude/work/build/app/test-tmp/noibat_90.jpg';
const ESPERADO = process.env.ESPERADO || '090/131';
let paso = 0;
const log = (...a) => console.log(`[${++paso}]`, ...a);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'es-PE' });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', e => errores.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/realtime|websocket|favicon|net::ERR|404|401/i.test(m.text())) errores.push(m.text()); });

try {
  await page.goto(APP + '/ingresar');
  await page.fill('input[autocomplete=username]', 'chris_tcg');
  await page.fill('input[type=password]', process.env.CLAVE || 'nuevaclave99');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/app/, { timeout: 20000 });
  log('sesión iniciada');

  await page.goto(APP + '/app/escanear');
  await page.waitForFunction(() => !!window.Vision, null, { timeout: 30000 });
  log('vision.js cargado; OCR soportado:', await page.evaluate(() => window.Vision.OCR.isSupported()));
  await page.waitForSelector('.notice, .small.muted:has-text("Reconocimiento listo")', { timeout: 30000 });
  await page.screenshot({ path: '/tmp/e2e/esc-01.png' });

  // subir la foto → recorte
  await page.setInputFiles('#fileInput', FOTO);
  await page.waitForSelector('.crop-box', { timeout: 20000 });
  // Ajustar el marco a la carta (fracciones de la foto: x 0.13–0.83, y 0.11–0.83)
  const geo = await page.evaluate(() => { const i = document.querySelector('.crop-wrap img').getBoundingClientRect(); const b = document.querySelector('.crop-box').getBoundingClientRect(); return { img: { x: i.x, y: i.y, w: i.width, h: i.height }, box: { x: b.x, y: b.y, w: b.width, h: b.height } }; });
  const objetivo = { x: geo.img.x + geo.img.w * (parseFloat(process.env.CX0 || '0.13')), y: geo.img.y + geo.img.h * (parseFloat(process.env.CY0 || '0.11')), w: geo.img.w * (parseFloat(process.env.CW || '0.70')) };
  // 1) redimensionar con la esquina, 2) mover
  const h = page.locator('.crop-box .handle');
  const hb = await h.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + (objetivo.w - geo.box.w), hb.y + hb.height / 2, { steps: 5 });
  await page.mouse.up();
  const bb = await page.locator('.crop-box').boundingBox();
  await page.mouse.move(bb.x + 20, bb.y + 20);
  await page.mouse.down();
  await page.mouse.move(bb.x + 20 + (objetivo.x - bb.x), bb.y + 20 + (objetivo.y - bb.y), { steps: 5 });
  await page.mouse.up();
  await page.screenshot({ path: '/tmp/e2e/esc-02-recorte.png' });
  log('marco ajustado:', JSON.stringify(await page.locator('.crop-box').boundingBox()));
  await page.click('text=Identificar carta');
  await page.waitForSelector('text=Identificando…', { timeout: 10000 });
  log('identificando…');
  await page.waitForSelector('.panel:has-text("Número leído"), .panel:has-text("No se pudo leer"), .panel:has-text("No se encontraron")', { timeout: 120000 });
  const texto = await page.textContent('.panel');
  await page.screenshot({ path: '/tmp/e2e/esc-03-resultado.png' });
  log('resultado:', texto.replace(/\s+/g, ' ').slice(0, 200));
  if (!texto.includes(`Número leído: ${ESPERADO}`)) throw new Error(`OCR no leyó ${ESPERADO}`);
  await page.waitForFunction(() => !/detectando idioma/.test(document.body.textContent), null, { timeout: 20000 }).catch(() => {});
  const linea = await page.textContent('.panel .small.muted');
  log('línea OCR/idioma:', linea.replace(/\s+/g, ' ').slice(0, 160));

  const filas = await page.$$eval('.card-list .card-row .card-name', els => els.map(e => e.textContent.trim()));
  log('candidatas:', filas.slice(0, 5).join(' | '));
  const fila = page.locator('.card-list .card-row', { hasText: 'Noibat' }).first();
  if (!(await fila.count())) throw new Error('Noibat no está entre las candidatas');
  await fila.click();
  await page.waitForSelector('.sheet:has-text("Guardar en una caja")');
  const idiomaSel = await page.$eval('.sheet select >> nth=1', s => s.value);
  log('idioma prellenado en la hoja:', idiomaSel || '(ninguno)');
  await page.click('.sheet-foot >> text=Guardar');
  await page.waitForSelector('.placement .where', { timeout: 20000 });
  log('guardada →', (await page.textContent('.placement .where')).trim());
  await page.screenshot({ path: '/tmp/e2e/esc-04-guardada.png' });
  await page.click('.sheet-foot >> text=Listo');

  // ajustes: panel de reconocimiento
  await page.goto(APP + '/app/ajustes');
  await page.waitForSelector('#reconocimiento');
  await page.waitForSelector('#reconocimiento >> text=Preparadas:', { timeout: 30000 });
  const stats = await page.textContent('#reconocimiento .small.muted >> nth=1');
  log('reconocimiento en ajustes:', stats.trim());
  await page.screenshot({ path: '/tmp/e2e/esc-05-ajustes.png' });

  if (errores.length) console.log('Errores de consola:', errores.slice(0, 8));
  console.log('\nESCÁNER OK ✔');
} catch (e) {
  await page.screenshot({ path: '/tmp/e2e/esc-ERROR.png' }).catch(() => {});
  console.error('\nESCÁNER FALLÓ en el paso', paso, ':', e.message);
  if (errores.length) console.error('Errores de consola:', errores.slice(0, 8));
  process.exitCode = 1;
} finally {
  await browser.close();
}
fs.writeFileSync('/tmp/e2e/esc-fin.txt', String(paso));
