// Fase 2 · D: mazos meta — parseo de Limitless, variantes (≥ 90 %) y "qué tengo" con equivalentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Catalogo, type DatosCatalogo } from '../src/lib/catalogo.ts';
import type { Entrada } from '../src/lib/coleccion.ts';
import { agruparVariantes, coincidencia, diferencias, parsearArquetipos, parsearLista, parsearListasDeArquetipo, type CartaMazo } from '../src/lib/mazos-core.ts';
import { analizarVariante, construirIndice, equivalentes, idsFaltantes, nombreClave } from '../src/lib/mazos-cliente.ts';
import { ARQUETIPOS, LISTAS, paginaArquetipo, paginaDecks, paginaLista } from './fixtures/limitless.mjs';

const datos = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'catalogo.json'), 'utf8')) as DatosCatalogo;
const cat = new Catalogo(datos);
const indice = construirIndice(cat);
let n = 0;
const entrada = (carta_id: string, cantidad = 1, idioma = ''): Entrada => ({ id: 'e' + ++n, usuario_id: 'u', carta_id, personalizada: null, caja_id: 'c', cantidad, acabado: '', idioma, condicion: '', nota: '', posicion: null, creado_en: '2026-01-01', actualizado_en: '' });
const lista = (id: number): CartaMazo[] => (LISTAS as Record<number, { cartas: [string, string, number, string, 'P' | 'T' | 'E'][] }>)[id].cartas.map(c => ({ set: c[0], num: c[1], n: c[2], nombre: c[3], cat: c[4] }));

test('Limitless: se leen los arquetipos de /decks', () => {
  const a = parsearArquetipos(paginaDecks());
  assert.equal(a.length, ARQUETIPOS.length);
  assert.deepEqual(a[0], { id: 284, nombre: 'Dragapult ex', iconos: ['dragapult'], orden: 1, puntos: 30052, cuota: 10.46 });
  assert.deepEqual(a[2].iconos, ['lugia', 'archeops']);
  assert.equal(a[2].nombre, 'Lugia Archeops');
});

test('Limitless: se leen las últimas listas de un arquetipo (puesto, jugador, torneo, iconos)', () => {
  const l = parsearListasDeArquetipo(paginaArquetipo(284));
  assert.deepEqual(l.map(x => x.id), [29182, 28936, 29476]);
  assert.deepEqual([l[0].puesto, l[0].jugador, l[0].torneo], [1, 'Edmund Khoo', '26th September 2026 - Regional Brisbane']);
  assert.deepEqual(l[2].iconos, ['dragapult', 'dusknoir']);
});

test('Limitless: se lee una lista con set, número, copias, nombre y categoría', () => {
  const { cartas } = parsearLista(paginaLista(29182)!);
  assert.equal(cartas.reduce((s, c) => s + c.n, 0), 60);
  assert.deepEqual(cartas[0], { set: 'MEW', num: '25', n: 4, nombre: 'Pikachu', cat: 'P' });
  assert.ok(cartas.some(c => c.nombre === "Bill's Transfer" && c.cat === 'T'));   // &#039; decodificado
  assert.ok(cartas.some(c => c.set === 'SVE' && c.cat === 'E' && c.n === 8));
  assert.equal(parsearLista('<html></html>').cartas.length, 0);
});

test('variantes: listas con ≥ 90 % de coincidencia se agrupan; el nombre sale de los iconos', () => {
  const l1 = lista(29182), l2 = lista(28936), l3 = lista(29476);
  assert.ok(coincidencia(l1, l2) >= 0.9, 'l1 y l2 difieren en 2 cartas → ≥ 90 %');
  assert.ok(coincidencia(l1, l3) < 0.9);
  const listas = [29182, 28936, 29476].map(id => ({ id, puesto: LISTAS[id as 29182].puesto, iconos: LISTAS[id as 29182].iconos, cartas: lista(id) }));
  const g = agruparVariantes(listas, 'Dragapult ex');
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].nombre, g[0].listas.length, g[0].mejorPuesto, g[0].representante.id], ['Dragapult ex', 2, 1, 29182]);
  assert.deepEqual([g[1].nombre, g[1].listas.length], ['Dragapult Dusknoir', 1]);
  const d = diferencias(l1, l2);
  assert.ok(d.some(x => x.carta.nombre === "Daisy's Help" && x.delta === 2));
  assert.ok(d.some(x => x.carta.nombre === 'Cycling Road' && x.delta === -1));
});

test('equivalentes: misma impresión primero; nombre para T/E, nombre + PS para Pokémon; sin japonesas', () => {
  assert.equal(nombreClave('Basic Psychic Energy'), 'psychic energy');
  assert.equal(nombreClave("Boss’s Orders"), "boss's orders");
  const pika = equivalentes(indice, { set: 'MEW', num: '25', n: 4, nombre: 'Pikachu', cat: 'P' });
  assert.equal(pika.misma?.id, 'sv03.5-025');
  assert.ok(pika.otras.length > 0 && pika.otras.every(c => c.hp === 60 && c.rg !== 'ja' && c.id !== 'sv03.5-025'));
  const ener = equivalentes(indice, { set: 'SVE', num: '5', n: 8, nombre: 'Basic Psychic Energy', cat: 'E' });
  assert.equal(ener.misma?.id, 'sve-005');
  assert.ok(ener.otras.some(c => c.id === 'mee-005' || c.id === 'mee-013'), 'las energías de otros sets equivalen por nombre');
  const desconocida = equivalentes(indice, { set: 'XXX', num: '1', n: 1, nombre: 'No existe', cat: 'T' });
  assert.deepEqual([desconocida.misma, desconocida.otras.length], [null, 0]);
});

test('qué tengo de una variante: cuenta copias una sola vez, ES/EN, misma impresión antes que equivalentes', () => {
  const cartas = lista(29182);
  // 4 Pikachu MEW (misma impresión) + 2 Pikachu de otra colección (equivalente, PS 60) + 1 japonesa (no cuenta) + 8 energías
  const es = [entrada('sv03.5-025', 2, 'EN'), entrada('sv03.5-025', 1, 'ES'), entrada('2019sm-6', 2), entrada('jp-SV2a-025', 3, 'JP'), entrada('sve-005', 5), entrada('mee-005', 4), entrada('sv03.5-004', 4, 'FR')];
  const a = analizarVariante(cat, indice, cartas, es);
  const pika = a.cartas.find(c => c.carta.nombre === 'Pikachu')!;
  assert.deepEqual([pika.necesarias, pika.tengo, pika.faltan], [4, 4, 0]);
  assert.deepEqual(pika.usadas.map(u => [u.carta.id, u.n]), [['sv03.5-025', 3], ['2019sm-6', 1]]);   // misma impresión primero
  const ener = a.cartas.find(c => c.carta.nombre === 'Basic Psychic Energy')!;
  assert.deepEqual([ener.tengo, ener.faltan], [8, 0]);   // 5 SVE + 3 de las MEE
  const charm = a.cartas.find(c => c.carta.nombre === 'Charmander')!;
  assert.equal(charm.tengo, 0);   // en francés no cuenta
  assert.equal(a.total, 60);
  assert.equal(a.tengo, 12);
  assert.equal(a.pct, 20);
  assert.ok(idsFaltantes(a).includes('sv03.5-004'));
  // la misma carta pedida dos veces en una lista no reutiliza copias
  const doble: CartaMazo[] = [{ set: 'MEW', num: '25', n: 2, nombre: 'Pikachu', cat: 'P' }, { set: 'MEW', num: '25', n: 2, nombre: 'Pikachu', cat: 'P' }];
  const b = analizarVariante(cat, indice, doble, [entrada('sv03.5-025', 3)]);
  assert.deepEqual([b.tengo, b.faltan], [3, 1]);
});

test('huellas compartidas: empaquetar y desempaquetar el archivo binario', async () => {
  const { empaquetarHuellas, desempaquetarHuellas, rutaHuellas } = await import('../src/lib/huellas.ts');
  const sigs = [{ id: 'sv03.5-001', sig: new Uint8Array([1, 2, 3, 4]) }, { id: 'sv03.5-002', sig: new Uint8Array([9, 8, 7, 6]) }];
  const cab = { v: 3, set: 'sv03.5', sigLen: 4, ids: sigs.map(s => s.id), count: 2, total: 2, ts: 1 };
  const bytes = empaquetarHuellas(cab, sigs);
  const r = desempaquetarHuellas(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)!;
  assert.deepEqual(r.cab, cab);
  assert.deepEqual(r.sigs.map(s => [s.id, [...s.sig]]), [['sv03.5-001', [1, 2, 3, 4]], ['sv03.5-002', [9, 8, 7, 6]]]);
  assert.equal(desempaquetarHuellas(new Uint8Array([1, 2, 3]).buffer), null);
  assert.equal(rutaHuellas('jp-SV2a', 3), 'v3/jp-SV2a.bin');
});
