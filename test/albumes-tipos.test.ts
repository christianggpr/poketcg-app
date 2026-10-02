// Mejoras 5 · B: tipos de álbum (líneas evolutivas, cartas por tipo, cuántas tengo, páginas, descripción).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Catalogo, type DatosCatalogo } from '../src/lib/catalogo.ts';
import { TIPOS_ALBUM, cartasDeTipoAlbum, cuantasTengo, descripcionTipo, lineaEvolutiva, paginasPara, rellenaSolo, tipoDeAlbum } from '../src/lib/albumes-tipos.ts';
import { CADENA, DESDE } from '../src/lib/evoluciones-datos.ts';

const datos = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'catalogo.json'), 'utf8')) as DatosCatalogo;
const cat = new Catalogo(datos);

test('líneas evolutivas (PokéAPI): Bulbasaur 1–3, Eevee con sus 8 evoluciones, Pikachu con Pichu y Raichu, Mew sola', () => {
  assert.equal(CADENA.length, 1025); assert.equal(DESDE.length, 1025);
  assert.deepEqual(lineaEvolutiva(1), [1, 2, 3]);
  assert.deepEqual(lineaEvolutiva(3), [1, 2, 3]);
  assert.deepEqual(lineaEvolutiva(133), [133, 134, 135, 136, 196, 197, 470, 471, 700]);
  assert.deepEqual(lineaEvolutiva(25), [25, 26, 172]);
  assert.deepEqual(lineaEvolutiva(151), [151]);
  assert.deepEqual(lineaEvolutiva(2000), [2000], 'fuera del rango: solo ella');
});

test('cartas de un álbum "Un Pokémon": solo esa especie, por fecha; con evoluciones también Ivysaur y Venusaur; idioma JP solo japonesas', () => {
  const solo = cartasDeTipoAlbum(cat, 'pokemon', { dex: 1 });
  assert.ok(solo.length > 30 && solo.every(c => c.dex!.includes(1)));
  for (let i = 1; i < solo.length; i++) assert.ok((cat.setOf(solo[i - 1])!.d || '') <= (cat.setOf(solo[i])!.d || ''), 'orden por fecha');
  const linea = cartasDeTipoAlbum(cat, 'pokemon', { dex: 1, evoluciones: true });
  assert.ok(linea.length > solo.length && linea.some(c => c.dex!.includes(3)));
  assert.equal(new Set(linea.map(c => c.id)).size, linea.length, 'sin repetidas');
  const jp = cartasDeTipoAlbum(cat, 'pokemon', { dex: 1, idioma: 'JP' });
  assert.ok(jp.length > 0 && jp.every(c => cat.setOf(c)!.rg === 'ja'));
  const en = cartasDeTipoAlbum(cat, 'pokemon', { dex: 1, idioma: 'EN' });
  assert.ok(en.length > 0 && en.every(c => cat.setOf(c)!.rg !== 'ja'));
  assert.equal(solo.length, jp.length + en.length);
  assert.deepEqual(cartasDeTipoAlbum(cat, 'pokemon', {}), []);
});

test('ilustrador y tipo: todas las de ese artista por fecha; las Planta son miles (empieza vacío); colección en su orden; libre ninguna', () => {
  const arita = cartasDeTipoAlbum(cat, 'ilustrador', { ilustrador: 'mitsuhiro arita' });
  assert.ok(arita.length > 300 && arita.every(c => c.il === 'Mitsuhiro Arita'));
  assert.equal(rellenaSolo('ilustrador', arita.length), false);
  assert.equal(rellenaSolo('ilustrador', 120), true);
  assert.equal(rellenaSolo('pokemon', 5000), true);
  assert.equal(rellenaSolo('tipo', 10), false);
  const planta = cartasDeTipoAlbum(cat, 'tipo', { tipo: 'Grass' });
  assert.ok(planta.length > 1000 && planta.every(c => c.t!.includes('Grass') && c.c === 'P'));
  const col = cartasDeTipoAlbum(cat, 'coleccion', { set: 'sv03.5' });
  assert.equal(col.length, 207); assert.equal(col[0].l, '001');
  assert.deepEqual(cartasDeTipoAlbum(cat, 'libre', {}), []);
});

test('cuántas tengo, páginas necesarias, tipo por defecto y descripción', () => {
  const lista = cartasDeTipoAlbum(cat, 'pokemon', { dex: 1 });
  assert.equal(cuantasTengo(lista, [{ carta_id: 'sv03.5-001' }, { carta_id: 'sv03.5-001' }, { carta_id: 'sv03.5-004' }]), 1);
  assert.equal(paginasPara(20, 3, 3), 3); assert.equal(paginasPara(0, 3, 3), 1); assert.equal(paginasPara(18, 3, 3), 2);
  assert.equal(tipoDeAlbum({ tipo_album: 'pokemon' }), 'pokemon'); assert.equal(tipoDeAlbum({ tipo_album: null }), 'libre'); assert.equal(tipoDeAlbum(undefined), 'libre'); assert.equal(tipoDeAlbum({ tipo_album: 'raro' }), 'libre');
  assert.equal(descripcionTipo(cat, { tipo_album: 'pokemon', parametros: { dex: 1, evoluciones: true, idioma: 'EN' } }, 'es'), 'Bulbasaur + evoluciones · EN');
  assert.equal(descripcionTipo(cat, { tipo_album: 'tipo', parametros: { tipo: 'Grass' } }, 'es'), 'Tipo Planta');
  assert.equal(descripcionTipo(cat, { tipo_album: 'ilustrador', parametros: { ilustrador: 'Mitsuhiro Arita' } }, 'es'), 'Mitsuhiro Arita');
  assert.equal(descripcionTipo(cat, { tipo_album: 'coleccion', parametros: { set: 'sv03.5', idioma: 'ES' } }, 'es'), '151 · ES');
  assert.equal(descripcionTipo(cat, { tipo_album: 'libre', parametros: {} }, 'es'), '');
  assert.equal(TIPOS_ALBUM.map(t => t.id).join(','), 'coleccion,pokemon,tipo,ilustrador,libre');
});
