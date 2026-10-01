// Mejoras 2 · B: repetidas en los álbumes, cartas del Bulk que pueden ir a una casilla vacía y posiciones al moverlas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Catalogo, type DatosCatalogo } from '../src/lib/catalogo.ts';
import type { Caja, Entrada } from '../src/lib/coleccion.ts';
import { desdeBulkParaAlbumes, posicionesEnBulk, repetidasEnAlbumes, resumenPosiciones } from '../src/lib/repetidas.ts';

const datos = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'catalogo.json'), 'utf8')) as DatosCatalogo;
const cat = new Catalogo(datos);
let n = 0;
const caja = (id: string, orden: number, modo: 'auto' | 'manual' = 'auto'): Caja => ({ id, usuario_id: 'u', nombre: 'Bulk ' + orden, descripcion: '', orden, modo, orden_colecciones: 'asc', en_venta: false, preguntar_venta: true, creado_en: '2026-01-01', actualizado_en: '2026-01-01' });
const entrada = (carta_id: string, extra: Partial<Entrada> = {}): Entrada => ({ id: 'e' + ++n, usuario_id: 'u', carta_id, personalizada: null, caja_id: null, cantidad: 1, acabado: '', idioma: '', condicion: '', nota: '', posicion: null, creado_en: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`, actualizado_en: '2026-01-01', ...extra });

test('repetidas: una casilla guarda 1 copia; el resto (de la misma entrada o de otra) son repetidas', () => {
  const a = entrada('sv03.5-004', { idioma: 'EN', album_coleccion: 'sv03.5', cantidad: 5 });          // Pinsir ×5 → 4 repetidas
  const b1 = entrada('sv03.5-001', { idioma: 'EN', album_coleccion: 'sv03.5' });
  const b2 = entrada('sv03.5-001', { idioma: 'EN', album_coleccion: 'sv03.5', acabado: 'Reverse', cantidad: 2 });   // segunda entrada → entera
  const es = entrada('sv03.5-001', { idioma: 'ES', album_coleccion: 'sv03.5' });                        // otro idioma: otra casilla
  const bulk = entrada('sv03.5-010', { idioma: 'EN', caja_id: 'c1', cantidad: 3 });                       // en el Bulk no cuenta
  const r = repetidasEnAlbumes(cat, [a, b1, b2, es, bulk]);
  assert.deepEqual(r.map(x => [x.carta.l, x.copias, x.todo, x.entrada.id]), [['001', 2, true, b2.id], ['004', 4, false, a.id]]);
  assert.equal(r.reduce((t, x) => t + x.copias, 0), 6);
  // si la entrada más antigua está publicada y hay otra sin publicar, se queda la que no está publicada (y sus copias de más salen)
  const r2 = repetidasEnAlbumes(cat, [b1, b2], new Set([b1.id]));
  assert.deepEqual(r2.map(x => [x.entrada.id, x.copias, x.todo, x.publicada]), [[b2.id, 1, false, false], [b1.id, 1, true, true]]);
  // solo un álbum
  assert.equal(repetidasEnAlbumes(cat, [a, entrada('sv08.5-002', { idioma: 'EN', album_coleccion: 'sv08.5', cantidad: 2 })], new Set(), 'sv08.5').length, 1);
});

test('desde el Bulk a los álbumes: solo casillas vacías de álbumes que tengo, una entrada por casilla', () => {
  const c1 = caja('c1', 1);
  const enAlbum = entrada('sv03.5-004', { idioma: 'EN', album_coleccion: 'sv03.5' });
  const dup = entrada('sv03.5-004', { idioma: 'EN', caja_id: 'c1' });                 // casilla ocupada: no
  const libre3 = entrada('sv03.5-001', { idioma: 'EN', caja_id: 'c1', cantidad: 3 });
  const libre1 = entrada('sv03.5-001', { idioma: 'EN', caja_id: 'c1' });              // misma casilla: se prefiere la de 1 copia
  const otro = entrada('sv08.5-002', { idioma: 'ES', caja_id: 'c1' });                // álbum ES de Prismatic: existe porque tengo esta carta
  const jp = entrada('jp-SV4a-001', { caja_id: 'c1' });
  const sinLugar = entrada('sv03.5-010', { idioma: 'EN' });                           // por colocar: no está en el Bulk
  const sinIdioma = entrada('sv03.5-010', { caja_id: 'c1' });                         // sin idioma: va al álbum "sin idioma" (—), no al EN
  const r = desdeBulkParaAlbumes(cat, [enAlbum, dup, libre3, libre1, otro, jp, sinLugar, sinIdioma], [c1]);
  assert.deepEqual(r.map(x => [x.set, x.idioma, x.carta.l, x.entrada.id, x.todo]), [['jp-SV4a', 'JP', '001', jp.id, true], ['sv03.5', '—', '010', sinIdioma.id, true], ['sv03.5', 'EN', '001', libre1.id, true], ['sv08.5', 'ES', '002', otro.id, true]]);
  assert.equal(desdeBulkParaAlbumes(cat, [enAlbum, dup, libre3, otro], [c1], 'sv03.5').map(x => x.entrada.id).join(), libre3.id);
  assert.equal(desdeBulkParaAlbumes(cat, [enAlbum, dup, libre3, otro], [c1], 'sv03.5')[0].todo, false, 'con 3 copias solo 1 va al álbum');
});

test('posiciones en el Bulk al mover varias (orden automático por colección y número; manual al final)', () => {
  const c1 = caja('c1', 1);
  const ya = [entrada('sv03.5-001', { caja_id: 'c1', posicion: 1 }), entrada('sv03.5-100', { caja_id: 'c1', posicion: 2 }), entrada('sv08.5-001', { caja_id: 'c1', posicion: 3 })];
  const m1 = entrada('sv03.5-004', { idioma: 'EN', album_coleccion: 'sv03.5' });
  const m2 = entrada('sv03.5-150', { idioma: 'EN', album_coleccion: 'sv03.5' });
  const { posiciones, total } = posicionesEnBulk(cat, c1, [...ya, m1, m2], [m1, m2]);
  assert.equal(total, 5);
  assert.equal(posiciones.get(m1.id), 2, '004 va entre 001 y 100');
  assert.equal(posiciones.get(m2.id), 4, '150 va después de 100 y antes de Prismatic');
  const manual = caja('c2', 2, 'manual');
  const yaM = [entrada('sv08.5-001', { caja_id: 'c2', posicion: 1 }), entrada('sv03.5-001', { caja_id: 'c2', posicion: 2 })];
  const pm = posicionesEnBulk(cat, manual, [...yaM, m1, m2], [m1, m2]).posiciones;
  assert.deepEqual([pm.get(m1.id), pm.get(m2.id)], [3, 4], 'en un Bulk manual van al final, en orden');
  assert.equal(resumenPosiciones([3, 4, 7, 9, 10, 11]), '#3–#4, #7, #9–#11');
});
