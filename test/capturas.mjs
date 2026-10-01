#!/usr/bin/env node
/**
 * Capturas de pantalla de la app de prueba (http://127.0.0.1:3000) en celular (390×844) y PC (1280×800),
 * para compararlas con las maquetas del layout. Usa los datos que deja `node test/e2e.mjs`.
 *
 *   node test/capturas.mjs [carpeta-destino] [usuario] [clave]
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(process.env.PLAYWRIGHT_MODULES || '/opt/node-tools/node_modules/');
const { chromium } = require('playwright');

const APP = 'http://127.0.0.1:3000';
const DESTINO = process.argv[2] || '/tmp/capturas-layout';
const USUARIO = process.argv[3] || 'chris_tcg';
const CLAVE = process.argv[4] || 'nuevaclave99';
fs.mkdirSync(DESTINO, { recursive: true });

/** Pantallas (nombre de la maqueta → ruta de la app y acción opcional). */
const PANTALLAS = [
  { nombre: 'Main', ruta: '/app/album' },
  { nombre: 'Mercado', ruta: '/app/mercado' },
  { nombre: 'Album', ruta: '/app/album/sv03.5?idioma=EN' },
  { nombre: 'Bulk', ruta: '/app/bulk' },
  { nombre: 'Carta', ruta: '/app/carta/sv03.5-004' },
  { nombre: 'Mazos', ruta: '/app/mazos' },
  { nombre: 'Carrito', ruta: '/app/carrito' },
  { nombre: 'Compras', ruta: '/app/compras' },
  { nombre: 'Ventas', ruta: '/app/ventas' },
  { nombre: 'Recibida', ruta: '/app/album', accion: async page => { const b = await page.$('[data-testid=carta-recibida] [data-testid=btn-elegir-album]'); if (b) { await b.click(); await page.waitForTimeout(400); } } },
  { nombre: 'Buscar', ruta: '/app/buscar?q=charmander' },
  { nombre: 'Ajustes', ruta: '/app/ajustes' },
  { nombre: 'Portada', ruta: '/', sinSesion: true },
  { nombre: 'Ingresar', ruta: '/ingresar', sinSesion: true }
];
const TAMANOS = [{ sufijo: 'celular', width: 390, height: 844, mobile: true }, { sufijo: 'pc', width: 1280, height: 800, mobile: false }];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const t of TAMANOS) {
  const ctx = await browser.newContext({ viewport: { width: t.width, height: t.height }, isMobile: t.mobile, hasTouch: t.mobile, deviceScaleFactor: 2, locale: 'es-PE' });
  const page = await ctx.newPage();
  await page.goto(APP + '/ingresar');
  await page.fill('input[autocomplete=username]', USUARIO);
  await page.fill('input[type=password]', CLAVE);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/app/, { timeout: 20000 }).catch(() => {});
  for (const p of PANTALLAS) {
    await page.goto(APP + p.ruta, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(600);
    if (p.accion) await p.accion(page);
    await page.mouse.move(2, 2);
    await page.screenshot({ path: path.join(DESTINO, `${p.nombre}-${t.sufijo}.png`), fullPage: false });
    console.log('captura', p.nombre, t.sufijo);
  }
  await ctx.close();
}
await browser.close();
console.log('listo:', DESTINO);
