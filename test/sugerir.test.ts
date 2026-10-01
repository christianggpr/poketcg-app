// Mejoras 1 · C3: sugerencia de dónde guardar una carta (álbum por colección, álbum personalizado, otro idioma, Bulk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Catalogo, type DatosCatalogo } from '../src/lib/catalogo.ts';
import type { Album, Caja, Casilla, Entrada } from '../src/lib/coleccion.ts';
import { Ubicador } from '../src/lib/coleccion.ts';
import { albumesPorColeccion, patronAlbum, sugerirDestino } from '../src/lib/sugerir.ts';

const datos = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'catalogo.json'), 'utf8')) as DatosCatalogo;
const cat = new Catalogo(datos);
let n = 0;
const caja = (id: string, orden: number): Caja => ({ id, usuario_id: 'u', nombre: 'Bulk ' + orden, descripcion: '', orden, modo: 'auto', orden_colecciones: 'asc', en_venta: false, preguntar_venta: true, creado_en: '2026-01-01', actualizado_en: '2026-01-01' });
const entrada = (carta_id: string, extra: Partial<Entrada> = {}): Entrada => ({ id: 'e' + ++n, usuario_id: 'u', carta_id, personalizada: null, caja_id: null, cantidad: 1, acabado: '', idioma: '', condicion: '', nota: '', posicion: null, creado_en: '2026-01-01T00:00:00Z', actualizado_en: '2026-01-01T00:00:00Z', ...extra });
const album = (id: string, nombre: string): Album => ({ id, usuario_id: 'u', nombre, descripcion: '', paginas: 2, columnas: 3, filas: 3, creado_en: '2026-01-01', actualizado_en: '2026-01-01' });
const casilla = (album_id: string, indice: number, carta_id: string, entrada_id: string | null = null): Casilla => ({ album_id, indice, carta_id, entrada_id });
const ctx = (p: Partial<Parameters<typeof sugerirDestino>[0]> = {}) => ({ cat, entradas: [], cajas: [], albumes: [], casillas: [], idiomaNombres: 'es' as const, ultimaCajaId: null, ...p });
const charmander151 = cat.carta('sv03.5-004')!;
const prismatica = cat.carta('sv08.5-002')!;

test('1 · misma colección y mismo idioma → álbum por colección, casilla de su número, con el motivo', () => {
  const s = sugerirDestino(ctx({ entradas: [entrada('sv08.5-001', { idioma: 'EN', caja_id: 'c1' }), entrada('sv08.5-003', { idioma: 'EN', album_coleccion: 'sv08.5' }), entrada('sv08.5-004', { idioma: 'EN' })], cajas: [caja('c1', 1)] }), prismatica, 'EN');
  assert.ok(s && s.tipo === 'coleccion');
  assert.equal(s.set, 'sv08.5'); assert.equal(s.idioma, 'EN');
  assert.match(s.motivo, /Porque coleccionas Evoluciones Prismáticas en inglés \(2 cartas, 1 en el álbum\): va en la casilla 002/, 'la carta sin ubicación (004) no cuenta');
  assert.equal(s.aviso, undefined);
});

test('2 · álbum personalizado con la línea de Charmander → bolsillo de ese álbum (y no para otras cartas)', () => {
  const alb = album('a1', 'Charmander');
  const linea = ['base1-4', 'base1-24', 'base1-46', 'base4-4', 'base4-35', 'base5-4'];   // Charizard, Charmeleon, Charmander… de otras colecciones
  const cas = linea.map((id, i) => casilla('a1', i, id, 'x' + i));
  const c = ctx({ albumes: [alb], casillas: cas, cajas: [caja('c1', 1)] });
  const s = sugerirDestino(c, charmander151, 'EN');
  assert.ok(s && s.tipo === 'album', JSON.stringify(s));
  assert.equal(s.album.id, 'a1'); assert.equal(s.indice, 6, 'el primer bolsillo libre');
  assert.match(s.motivo, /Porque tu álbum «Charmander» tiene 6 cartas de Charmander, Charmeleon, Charizard/);
  // una carta que no es de la línea no va a ese álbum: cae al Bulk
  const otra = sugerirDestino(c, cat.carta('sv03.5-025')!, 'EN');
  assert.ok(otra && otra.tipo === 'bulk');
  // si el álbum ya tiene asignada esta carta en un bolsillo sin copia física, se sugiere ese bolsillo
  const conHueco = sugerirDestino(ctx({ albumes: [alb], casillas: [...cas, casilla('a1', 10, 'sv03.5-004')] }), charmander151, 'EN');
  assert.ok(conHueco && conHueco.tipo === 'album' && conHueco.indice === 10);
});

test('2b · patrón por ilustrador: un álbum de Mitsuhiro Arita recibe otra carta suya', () => {
  const cas = ['sv03.5-063', 'sv03.5-064', 'sv03.5-065', 'sv03.5-170'].map((id, i) => casilla('a2', i, id));
  const p = patronAlbum(cat, cas.map(c => cat.carta(c.carta_id)!));
  assert.deepEqual([p?.clase, p?.valor], ['ilustrador', 'Mitsuhiro Arita']);
  const s = sugerirDestino(ctx({ albumes: [album('a2', 'Arita')], casillas: cas }), cat.carta('base1-4')!, 'EN');
  assert.ok(s && s.tipo === 'album' && /ilustradas por Mitsuhiro Arita/.test(s.motivo), JSON.stringify(s));
});

test('3 · misma colección en otro idioma → se sugiere con aviso de idioma', () => {
  const s = sugerirDestino(ctx({ entradas: [entrada('sv08.5-001', { idioma: 'ES', caja_id: 'c1' }), entrada('sv08.5-010', { idioma: 'ES', caja_id: 'c1' })], cajas: [caja('c1', 1)] }), prismatica, 'EN');
  assert.ok(s && s.tipo === 'coleccion' && s.idioma === 'ES');
  assert.match(s.aviso || '', /Ese álbum está en español y esta carta es en inglés/);
});

test('4 · sin álbum de esa colección → el último Bulk usado, con la posición que le tocaría', () => {
  const cajas = [caja('c1', 1), caja('c2', 2)];
  const entradas = [entrada('sv01-001', { caja_id: 'c2' }), entrada('sv08.5-001', { caja_id: 'c2' }), entrada('sv08.5-010', { caja_id: 'c1', idioma: 'ES' })];
  const s = sugerirDestino(ctx({ entradas, cajas, ultimaCajaId: 'c2' }), charmander151, 'EN');
  assert.ok(s && s.tipo === 'bulk', JSON.stringify(s));
  assert.equal(s.caja.id, 'c2'); assert.equal(s.posicion, 2, 'entre Scarlet & Violet 001 (2023) y Prismatic 001 (2025): por fecha de colección'); assert.equal(s.total, 3);
  assert.match(s.motivo, /Porque no tienes un álbum de 151: iría a Bulk 2, posición #2 de 3/);
  // la posición sugerida coincide con la real al guardarla
  const nueva = entrada('sv03.5-004', { caja_id: 'c2', idioma: 'EN' });
  assert.equal(new Ubicador(cat, cajas, [...entradas, nueva], 'es').ubicacion(nueva)?.idx, 2);
  // sin ningún Bulk ni álbum: no hay sugerencia
  assert.equal(sugerirDestino(ctx(), charmander151, 'EN'), null);
});

test('álbumes por colección: se cuentan por colección e idioma (sin idioma = EN, o JP para japonesas)', () => {
  const m = albumesPorColeccion(cat, [entrada('sv03.5-001'), entrada('sv03.5-002', { idioma: 'EN', cantidad: 2 }), entrada('sv03.5-003', { idioma: 'ES' }), entrada('jp-SV4a-001')]);
  assert.equal(m.get('sv03.5|EN')?.cartas, 3);
  assert.equal(m.get('sv03.5|ES')?.cartas, 1);
  assert.equal(m.get('jp-SV4a|JP')?.cartas, 1);
});

test('ubicación en álbumes: por colección (casilla = número) y en bolsillos de álbumes personalizados', () => {
  const alb = album('a1', 'Charmander');
  const e1 = entrada('sv08.5-002', { idioma: 'EN', album_coleccion: 'sv08.5' });
  const e2 = entrada('sv03.5-004');
  const u = new Ubicador(cat, [], [e1, e2], 'es', [alb], [casilla('a1', 4, 'sv03.5-004', e2.id)]);
  const d1 = u.donde(e1); const d2 = u.donde(e2);
  assert.ok(d1 && d1.tipo === 'coleccion' && d1.numero === '002' && d1.idioma === 'EN');
  assert.ok(d2 && d2.tipo === 'album' && d2.pagina === 1 && d2.bolsillo === 5);
  assert.equal(u.donde(entrada('sv03.5-001')), null);
});
