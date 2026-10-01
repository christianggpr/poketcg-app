#!/usr/bin/env node
/**
 * Genera public/data/catalogo.json (y public/data/version.json) a partir de la base de cartas de
 * PokéBóveda v1 (data/cards.js) y de la lista de especies (data/dex.js).
 *
 *   node tools/generar-catalogo.mjs <ruta/cards.js> <ruta/dex.js>
 *   node tools/generar-catalogo.mjs --solo-imagenes   # sin la base v1: toma el catálogo actual y solo
 *                                                      # incorpora tools/imagenes.json (lo usa GitHub Actions)
 *
 * Además de copiar las colecciones y las cartas, completa los huecos de numeración de cada
 * colección con casillas "Carta N.º X — sin datos" (campo sd: true) para que los álbumes se
 * puedan armar con el total oficial aunque a la base le falten datos de algunas cartas.
 * Al final incorpora los datos de imágenes de tools/imagenes.json (tools/validar-imagenes.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(here, '..');
const argumentos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [rutaCards = path.join(here, 'fuente-v1-cards.js'), rutaDex = path.join(here, 'fuente-v1-dex.js')] = argumentos;
const rutaCatalogo = path.join(raiz, 'public', 'data', 'catalogo.json');
const soloImagenes = process.argv.includes('--solo-imagenes') || !fs.existsSync(rutaCards);
if (soloImagenes && !fs.existsSync(rutaCatalogo)) { console.error('No está la base v1 (tools/fuente-v1-cards.js) ni el catálogo actual: no hay de dónde generar.'); process.exit(1); }

function cargarScript(ruta, variable) {
  const src = fs.readFileSync(ruta, 'utf8');
  const window = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(window);
  if (!window[variable]) throw new Error(`${ruta} no define window.${variable}`);
  return window[variable];
}

// Versión: la fecha de hoy y un número que sube si ya se generó otra versión hoy (la app descarga el catálogo de nuevo cuando cambia).
const hoy = new Date().toISOString().slice(0, 10);
const versionActual = (() => { try { return JSON.parse(fs.readFileSync(path.join(raiz, 'public', 'data', 'version.json'), 'utf8')).version || ''; } catch { return ''; } })();
const version = process.env.CATALOGO_VERSION || (versionActual.startsWith(hoy + '.') ? `${hoy}.${(parseInt(versionActual.slice(hoy.length + 1), 10) || 0) + 1}` : hoy + '.1');

let catalogo, informe = null, resumenV1 = '';
if (soloImagenes) {
  catalogo = JSON.parse(fs.readFileSync(rutaCatalogo, 'utf8'));
  catalogo.version = version;
  catalogo.generated = new Date().toISOString();
  resumenV1 = `Catálogo ${version} (a partir del catálogo actual, sin la base v1): ${catalogo.sets.length} colecciones, ${catalogo.cards.length} cartas.`;
} else {
  ({ catalogo, informe, resumenV1 } = construirDesdeV1());
}

function construirDesdeV1() {
const db = cargarScript(rutaCards, 'TCG_DB');
const dex = cargarScript(rutaDex, 'DEX_DB');

// Colecciones en las que NO conviene rellenar huecos: kits de entrenador (dos mitades numeradas
// sobre el mismo total) y colecciones cuya numeración no es numérica (Unown A–Z, etc.).
const SIN_RELLENO = new Set(['tk']);
// Números que no corresponden a cartas reales (numeración propia de TCGdex para las energías de VS).
const SIN_RELLENO_NUMEROS = { 'jp-VS1': new Set([145, 146, 147, 148, 149, 150]) };
// Datos recogidos a mano para las casillas que faltaban (tools/completar-huecos.mjs)
const rutaCompletados = path.join(here, 'huecos-completados.json');
const completados = fs.existsSync(rutaCompletados) ? JSON.parse(fs.readFileSync(rutaCompletados, 'utf8')) : {};

function numero(l) {
  const m = /^0*(\d+)$/.exec(String(l || '').trim());
  return m ? parseInt(m[1], 10) : null;
}

const cartasPorSet = new Map();
for (const c of db.cards) {
  if (!cartasPorSet.has(c.s)) cartasPorSet.set(c.s, []);
  cartasPorSet.get(c.s).push(c);
}

const rellenos = [];
const informe = [];
for (const s of db.sets) {
  if (SIN_RELLENO.has(s.s)) continue;
  const cartas = cartasPorSet.get(s.id) || [];
  const numericas = cartas.map(c => numero(c.l)).filter(n => n != null);
  if (!numericas.length) continue;
  const max = Math.max(...numericas);
  // Si la mayoría de las cartas no tiene número simple, la numeración es especial: no se rellena.
  if (numericas.length < cartas.length * 0.5) continue;
  const presentes = new Set(numericas);
  const excluidos = SIN_RELLENO_NUMEROS[s.id] || new Set();
  const faltan = [];
  for (let i = 1; i <= max; i++) if (!presentes.has(i) && !excluidos.has(i)) faltan.push(i);
  if (!faltan.length) continue;
  // Huecos enormes (más de la mitad) indican otra numeración, no datos faltantes.
  if (faltan.length > max * 0.5) { informe.push(`${s.id}: ${faltan.length} huecos de ${max}, numeración especial, no se rellena`); continue; }
  // Se respeta el estilo de numeración de la colección: "001" (con ceros) o "1" (sin ceros).
  const conCeros = cartas.some(c => /^0\d+$/.test(c.l));
  const ancho = conCeros ? Math.max(...cartas.map(c => (/^\d+$/.test(c.l) ? c.l.length : 0))) : 0;
  const pendientes = [];
  for (const n of faltan) {
    const l = ancho > 1 ? String(n).padStart(ancho, '0') : String(n);
    const id = `${s.id}-${l}`;
    const datos = completados[id];
    if (datos) rellenos.push({ id, s: s.id, l, ...datos, ...(s.rg ? { rg: s.rg } : {}) });
    else { rellenos.push({ id, s: s.id, l, n: `Carta N.º ${n}`, ns: `Carta N.º ${n}`, c: '?', sd: true, ...(s.rg ? { rg: s.rg } : {}) }); pendientes.push(n); }
  }
  informe.push(`${s.id} (${s.n}): ${faltan.length} huecos, ${faltan.length - pendientes.length} completados a mano${pendientes.length ? `, sin datos → ${resumen(pendientes)}` : ''}`);
}

function resumen(nums) {
  const partes = [];
  let ini = nums[0], fin = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    if (i < nums.length && nums[i] === fin + 1) { fin = nums[i]; continue; }
    partes.push(ini === fin ? String(ini) : `${ini}–${fin}`);
    ini = fin = nums[i];
  }
  return partes.join(', ');
}

// Números de Pokédex con decimales (formas: 384.1) → entero
for (const c of db.cards) if (c.dex) c.dex = c.dex.map(d => Math.floor(Number(d))).filter(d => Number.isInteger(d));
const ids = new Set(db.cards.map(c => c.id));
const nuevos = rellenos.filter(r => !ids.has(r.id));
const catalogo = {
  version,
  generated: new Date().toISOString(),
  sets: db.sets,
  cards: db.cards.concat(nuevos),
  species: dex
};
const sinDatos = nuevos.filter(c => c.sd).length;
const resumenV1 = `Catálogo ${version}: ${catalogo.sets.length} colecciones, ${db.cards.length} cartas + ${nuevos.length - sinDatos} completadas a mano + ${sinDatos} casillas sin datos (${catalogo.cards.length} en total), ${dex.length} especies.`;
return { catalogo, informe, resumenV1 };
}

// Imágenes (tools/validar-imagenes.mjs → tools/imagenes.json): qué números no tienen imagen en TCGdex en cada
// idioma (ien / ies / ija de la colección) y qué cartas usan otra fuente (im = [origen, url pequeña, url grande]).
// Con esto la app pide la imagen correcta a la primera en vez de probar direcciones que fallan.
const rutaImagenes = path.join(here, 'imagenes.json');
if (fs.existsSync(rutaImagenes)) {
  const img = JSON.parse(fs.readFileSync(rutaImagenes, 'utf8'));
  const cartasPorId = new Map(catalogo.cards.map(c => [c.id, c]));
  let setsImg = 0, cartasOtra = 0, marcas = 0;
  for (const s of catalogo.sets) {
    const r = img.sets && img.sets[s.id];
    if (!r) continue;
    setsImg++;
    delete s.ien; delete s.ies; delete s.ija;
    if (s.rg === 'ja') {
      if (r.ja) { if (!r.ja.existe) s.ija = 0; else if (r.ja.sin.length) s.ija = r.ja.sin; }
    } else {
      if (r.en) { if (!r.en.existe) s.ien = 0; else if (r.en.sin.length) s.ien = r.en.sin; }
      if (r.es && r.es.existe) s.ies = r.es.sin.length ? r.es.sin : 1;
    }
  }
  for (const c of catalogo.cards) delete c.im;
  // la URL grande se omite cuando la app puede deducirla de la pequeña (ahorra espacio en el catálogo)
  const compactar = (im) => (im.length > 2 && ((im[0] === 'limitless' && im[2] === im[1].replace(/_LG\.png$/, '.png')) || (im[0] === 'pokemontcg' && im[2] === im[1].replace(/\.png$/, '_hires.png'))) ? [im[0], im[1]] : im);
  for (const [id, im] of Object.entries(img.cartas || {})) { const c = cartasPorId.get(id); if (c) { c.im = compactar(im); cartasOtra++; } }
  for (const id of img.yaEnTcgdex || []) { const c = cartasPorId.get(id); if (c && c.sinTcgdex) { delete c.sinTcgdex; marcas++; } }
  console.log(`Imágenes (${img.generado ? img.generado.slice(0, 10) : '?'}): ${setsImg} colecciones con datos, ${cartasOtra} cartas con imagen de otra fuente, ${marcas} completadas a mano que ya están en TCGdex.`);
} else {
  console.log('Sin tools/imagenes.json: el catálogo sale sin datos de imágenes (ejecuta tools/validar-imagenes.mjs).');
}

fs.mkdirSync(path.join(raiz, 'public', 'data'), { recursive: true });
fs.writeFileSync(rutaCatalogo, JSON.stringify(catalogo));
const sinDatos = catalogo.cards.filter(c => c.sd).length;
fs.writeFileSync(path.join(raiz, 'public', 'data', 'version.json'), JSON.stringify({ version, sets: catalogo.sets.length, cards: catalogo.cards.length, sinDatos }, null, 2) + '\n');
if (informe) fs.writeFileSync(path.join(raiz, 'tools', 'informe-huecos.txt'), informe.join('\n') + '\n');
fs.writeFileSync(path.join(raiz, 'src', 'lib', 'catalogo-version.ts'), `// Generado por tools/generar-catalogo.mjs — no editar a mano.\nexport const CATALOGO_VERSION = '${version}';\nexport const CATALOGO_RESUMEN = { sets: ${catalogo.sets.length}, cards: ${catalogo.cards.length}, sinDatos: ${sinDatos} };\n`);

console.log(resumenV1);
if (informe) console.log(`Informe de huecos: tools/informe-huecos.txt (${informe.length} colecciones)`);
