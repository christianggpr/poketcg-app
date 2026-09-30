#!/usr/bin/env node
/**
 * Valida public/data/catalogo.json: ids únicos, cartas con colección existente, nombres,
 * numeración frente al total oficial (cc = total impreso, ct = total con secretas) y casillas
 * "sin datos" pendientes de completar.
 *
 *   node tools/validar-catalogo.mjs            → informe en pantalla (código de salida 1 si hay errores)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cat = JSON.parse(fs.readFileSync(path.join(raiz, 'public', 'data', 'catalogo.json'), 'utf8'));

const errores = [];
const avisos = [];

const setIds = new Set();
for (const s of cat.sets) {
  if (setIds.has(s.id)) errores.push(`colección repetida: ${s.id}`);
  setIds.add(s.id);
  if (!s.n) errores.push(`colección sin nombre: ${s.id}`);
  if (!s.d) avisos.push(`colección sin fecha: ${s.id}`);
}

const cardIds = new Set();
const porSet = new Map();
for (const c of cat.cards) {
  if (cardIds.has(c.id)) errores.push(`carta repetida: ${c.id}`);
  cardIds.add(c.id);
  if (!setIds.has(c.s)) errores.push(`carta con colección inexistente: ${c.id} → ${c.s}`);
  if (!c.n) errores.push(`carta sin nombre: ${c.id}`);
  if (!c.l) errores.push(`carta sin número: ${c.id}`);
  if (!['P', 'T', 'E', '?'].includes(c.c)) errores.push(`categoría rara en ${c.id}: ${c.c}`);
  if (!porSet.has(c.s)) porSet.set(c.s, []);
  porSet.get(c.s).push(c);
}

let sinDatos = 0;
const pendientes = [];
for (const s of cat.sets) {
  const cartas = porSet.get(s.id) || [];
  const sd = cartas.filter(c => c.sd);
  sinDatos += sd.length;
  if (sd.length) pendientes.push(`${s.id}: ${sd.length} casillas sin datos (${sd.slice(0, 8).map(c => c.l).join(', ')}${sd.length > 8 ? '…' : ''})`);
  if (!cartas.length) avisos.push(`colección vacía: ${s.id} (${s.n})`);
  const numericas = cartas.map(c => /^0*(\d+)$/.exec(c.l)).filter(Boolean).map(m => parseInt(m[1], 10));
  if (numericas.length && s.cc && Math.max(...numericas) < s.cc && s.s !== 'tk') {
    avisos.push(`${s.id} (${s.n}): la numeración llega a ${Math.max(...numericas)} pero el total impreso es ${s.cc}`);
  }
}

const especies = cat.species || [];
if (especies.length < 1000) avisos.push(`solo ${especies.length} especies en la Pokédex`);

console.log(`Catálogo ${cat.version}: ${cat.sets.length} colecciones, ${cat.cards.length} cartas (${sinDatos} sin datos), ${especies.length} especies.`);
if (pendientes.length) { console.log('\nCasillas pendientes de completar:'); for (const p of pendientes) console.log('  - ' + p); }
if (avisos.length) { console.log(`\nAvisos (${avisos.length}):`); for (const a of avisos.slice(0, 40)) console.log('  · ' + a); if (avisos.length > 40) console.log(`  · … y ${avisos.length - 40} más`); }
if (errores.length) { console.log(`\nERRORES (${errores.length}):`); for (const e of errores.slice(0, 40)) console.log('  ✗ ' + e); process.exit(1); }
console.log('\nSin errores.');
