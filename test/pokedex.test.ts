// Mejoras 4 · C: Pokédex (una casilla por especie en orden nacional): generaciones, índice especie → cartas,
// carta representativa de una especie que falta y la copia más valiosa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Catalogo, type DatosCatalogo } from '../src/lib/catalogo.ts';
import { GENERACIONES, cartaRepresentativa, cartasPorEspecie, especiesOrdenadas, generacionDe, masValiosa, numeroDex, tipoEspecie } from '../src/lib/pokedex.ts';

const datos = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'catalogo.json'), 'utf8')) as DatosCatalogo;
const cat = new Catalogo(datos);

test('generaciones: 1–151 Kanto … 906+ Paldea; n.º con cuatro cifras', () => {
  assert.equal(GENERACIONES.length, 9);
  assert.equal(generacionDe(1), 1); assert.equal(generacionDe(151), 1); assert.equal(generacionDe(152), 2); assert.equal(generacionDe(386), 3);
  assert.equal(generacionDe(493), 4); assert.equal(generacionDe(649), 5); assert.equal(generacionDe(721), 6); assert.equal(generacionDe(809), 7);
  assert.equal(generacionDe(905), 8); assert.equal(generacionDe(906), 9); assert.equal(generacionDe(1025), 9); assert.equal(generacionDe(0), 0);
  assert.equal(numeroDex(1), '0001'); assert.equal(numeroDex(25), '0025'); assert.equal(numeroDex(1025), '1025');
});

test('especies del catálogo en orden nacional: 0001 Bulbasaur … última 1025', () => {
  const sp = especiesOrdenadas(cat);
  assert.ok(sp.length >= 1000);
  assert.equal(sp[0][0], 1); assert.equal(sp[0][1], 'Bulbasaur');
  assert.equal(sp[sp.length - 1][0], 1025);
  for (let i = 1; i < sp.length; i++) assert.ok(sp[i][0] > sp[i - 1][0], 'orden creciente');
});

test('índice especie → cartas: Pikachu (25) tiene muchas cartas, todas con dex 25; una carta de dos Pokémon cuenta para los dos', () => {
  const m = cartasPorEspecie(cat);
  const pika = m.get(25) || [];
  assert.ok(pika.length > 100, 'Pikachu tiene más de 100 cartas');
  assert.ok(pika.every(c => c.dex!.includes(25)));
  assert.ok(m.get(1)!.some(c => c.id === 'sv03.5-001'), 'Bulbasaur de 151 está en la especie 1');
  const doble = cat.cards.find(c => c.dex && c.dex.length >= 2 && !c.sd);
  if (doble) for (const d of doble.dex!) assert.ok(m.get(d)!.includes(doble), 'la carta doble está en las dos especies');
  assert.equal(cartasPorEspecie(cat), m, 'el índice se construye una sola vez por catálogo');
});

test('tipo de una especie: el más frecuente entre sus cartas (Pikachu → Rayo, Charizard → Fuego); carta representativa: la más reciente internacional y normal', () => {
  const m = cartasPorEspecie(cat);
  assert.equal(tipoEspecie(m.get(25)!), 'Lightning');
  assert.equal(tipoEspecie(m.get(6)!), 'Fire');
  assert.equal(tipoEspecie([]), '');
  const r = cartaRepresentativa(cat, m.get(25)!)!;
  const s = cat.setOf(r)!;
  assert.ok(r.dex!.includes(25) && !r.sd && s.rg !== 'ja', 'internacional y con datos');
  const num = parseInt(r.l, 10);
  assert.ok(Number.isFinite(num) && num <= s.cc, 'número dentro del total impreso (no secreta)');
  // ninguna otra internacional normal de Pikachu es más reciente
  for (const c of m.get(25)!) { const sc = cat.setOf(c); if (!sc || sc.rg === 'ja' || c.sd || c.c !== 'P') continue; const n = parseInt(c.l, 10); if (!Number.isFinite(n) || n > sc.cc) continue; assert.ok((sc.d || '') <= (s.d || ''), `${c.id} sería más reciente que ${r.id}`); }
  assert.equal(cartaRepresentativa(cat, []), undefined);
});

test('la copia más valiosa: mayor precio y, a igual precio, la de colección más reciente', () => {
  const a = cat.carta('sv03.5-001')!, b = cat.carta('sv03.5-004')!;
  const copias = [
    { entrada: 'x', carta: a, pen: 5, fecha: '2023-09-22' },
    { entrada: 'y', carta: b, pen: 12, fecha: '2023-09-22' },
    { entrada: 'z', carta: a, pen: 12, fecha: '2024-01-01' }
  ];
  assert.equal(masValiosa(copias)!.entrada, 'z');
  assert.equal(masValiosa([copias[0]])!.entrada, 'x');
  assert.equal(masValiosa([]), undefined);
});
