#!/usr/bin/env node
/**
 * Genera public/data/catalogo.json (y public/data/version.json) a partir de la base de cartas de
 * PokéBóveda v1 (data/cards.js) y de la lista de especies (data/dex.js).
 *
 *   node tools/generar-catalogo.mjs <ruta/cards.js> <ruta/dex.js>
 *
 * Además de copiar las colecciones y las cartas, completa los huecos de numeración de cada
 * colección con casillas "Carta N.º X — sin datos" (campo sd: true) para que los álbumes se
 * puedan armar con el total oficial aunque a la base le falten datos de algunas cartas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(here, '..');
const [, , rutaCards = path.join(here, 'fuente-v1-cards.js'), rutaDex = path.join(here, 'fuente-v1-dex.js')] = process.argv;

function cargarScript(ruta, variable) {
  const src = fs.readFileSync(ruta, 'utf8');
  const window = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(window);
  if (!window[variable]) throw new Error(`${ruta} no define window.${variable}`);
  return window[variable];
}

const db = cargarScript(rutaCards, 'TCG_DB');
const dex = cargarScript(rutaDex, 'DEX_DB');

// Colecciones en las que NO conviene rellenar huecos: kits de entrenador (dos mitades numeradas
// sobre el mismo total) y colecciones cuya numeración no es numérica (Unown A–Z, etc.).
const SIN_RELLENO = new Set(['tk']);

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
  const faltan = [];
  for (let i = 1; i <= max; i++) if (!presentes.has(i)) faltan.push(i);
  if (!faltan.length) continue;
  // Huecos enormes (más de la mitad) indican otra numeración, no datos faltantes.
  if (faltan.length > max * 0.5) { informe.push(`${s.id}: ${faltan.length} huecos de ${max}, numeración especial, no se rellena`); continue; }
  // Se respeta el estilo de numeración de la colección: "001" (con ceros) o "1" (sin ceros).
  const conCeros = cartas.some(c => /^0\d+$/.test(c.l));
  const ancho = conCeros ? Math.max(...cartas.map(c => (/^\d+$/.test(c.l) ? c.l.length : 0))) : 0;
  for (const n of faltan) {
    const l = ancho > 1 ? String(n).padStart(ancho, '0') : String(n);
    rellenos.push({ id: `${s.id}-${l}`, s: s.id, l, n: `Carta N.º ${n}`, ns: `Carta N.º ${n}`, c: '?', sd: true, ...(s.rg ? { rg: s.rg } : {}) });
  }
  informe.push(`${s.id} (${s.n}): ${faltan.length} sin datos → ${resumen(faltan)}`);
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
const version = new Date().toISOString().slice(0, 10) + '.1';
const catalogo = {
  version,
  generated: new Date().toISOString(),
  sets: db.sets,
  cards: db.cards.concat(nuevos),
  species: dex
};

fs.mkdirSync(path.join(raiz, 'public', 'data'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'public', 'data', 'catalogo.json'), JSON.stringify(catalogo));
fs.writeFileSync(path.join(raiz, 'public', 'data', 'version.json'), JSON.stringify({ version, sets: catalogo.sets.length, cards: catalogo.cards.length, sinDatos: nuevos.length }, null, 2) + '\n');
fs.writeFileSync(path.join(raiz, 'tools', 'informe-huecos.txt'), informe.join('\n') + '\n');
fs.writeFileSync(path.join(raiz, 'src', 'lib', 'catalogo-version.ts'), `// Generado por tools/generar-catalogo.mjs — no editar a mano.\nexport const CATALOGO_VERSION = '${version}';\nexport const CATALOGO_RESUMEN = { sets: ${catalogo.sets.length}, cards: ${catalogo.cards.length}, sinDatos: ${nuevos.length} };\n`);

console.log(`Catálogo ${version}: ${catalogo.sets.length} colecciones, ${db.cards.length} cartas + ${nuevos.length} casillas sin datos (${catalogo.cards.length} en total), ${dex.length} especies.`);
console.log(`Informe de huecos: tools/informe-huecos.txt (${informe.length} colecciones)`);
