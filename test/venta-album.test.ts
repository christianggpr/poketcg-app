// Mejoras 2 · C: poner en venta un álbum eligiendo con qué me quedo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entrada } from '../src/lib/coleccion.ts';
import { REGLAS_POR_DEFECTO, repartirVenta, type ReglasVenta } from '../src/lib/venta-album.ts';

let n = 0;
const entrada = (carta_id: string, cantidad: number, extra: Partial<Entrada> = {}): Entrada => ({ id: 'e' + ++n, usuario_id: 'u', carta_id, personalizada: null, caja_id: null, cantidad, acabado: '', idioma: 'EN', condicion: '', nota: '', posicion: null, album_coleccion: 'sv03.5', creado_en: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`, actualizado_en: '2026-01-01', ...extra });
const precios: Record<string, number> = { pinsir: 12, charizard: 320, pikachu: 60, rattata: 1.5 };
const precioDe = (e: Entrada) => precios[e.carta_id as string] ?? 5;
const reglas = (p: Partial<ReglasVenta> = {}): ReglasVenta => ({ ...REGLAS_POR_DEFECTO, mayorPrecio: { ...REGLAS_POR_DEFECTO.mayorPrecio }, excluidas: new Set(), ...p });

test('1 de cada carta: 5 Pinsir → 1 se queda y 4 se publican; las cartas únicas no se publican', () => {
  const pinsir = entrada('pinsir', 5), rattata = entrada('rattata', 1);
  const r = repartirVenta([pinsir, rattata], precioDe, reglas());
  assert.deepEqual(r.lineas.map(l => [l.cartaId, l.publicar, l.quedan, l.motivo]), [['pinsir', 4, 1, 'una'], ['rattata', 0, 1, 'una']]);
  assert.equal(r.publican, 4); assert.equal(r.quedan, 2); assert.equal(r.total, 48); assert.equal(r.conFoto, 0);
  assert.equal(r.cartasPublicadas, 1); assert.equal(r.cartasQuedan, 2);
  // dos entradas de la misma carta: la copia que se queda es la de la casilla del álbum (aunque la del Bulk sea más antigua)
  const bulk = entrada('pikachu', 2, { acabado: 'Reverse', album_coleccion: null, caja_id: 'c1' }), alb = entrada('pikachu', 1);
  const r2 = repartirVenta([bulk, alb], precioDe, reglas());
  assert.deepEqual(r2.lineas.map(l => [l.entrada.id, l.publicar, l.quedan]).sort(), [[alb.id, 0, 1], [bulk.id, 2, 0]].sort());
  assert.equal(r2.conFoto, 1, 'Pikachu a S/ 60 necesitará foto');
});

test('mayor precio: límite S/ 50 no publica ninguna carta de más de S/ 50; "las N más caras" se quedan completas; combinable con 1 de cada', () => {
  const pinsir = entrada('pinsir', 5), chari = entrada('charizard', 2), pika = entrada('pikachu', 3), ratt = entrada('rattata', 4);
  const r = repartirVenta([pinsir, chari, pika, ratt], precioDe, reglas({ unaDeCada: false, mayorPrecio: { activo: true, tipo: 'limite', limite: 50, n: 0 } }));
  assert.deepEqual(r.lineas.map(l => [l.cartaId, l.publicar, l.quedan, l.motivo]), [['pinsir', 5, 0, undefined], ['charizard', 0, 2, 'precio'], ['pikachu', 0, 3, 'precio'], ['rattata', 4, 0, undefined]]);
  assert.ok(r.lineas.every(l => l.publicar === 0 || l.precio <= 50));
  assert.deepEqual([...r.cartasCaras].sort(), ['charizard', 'pikachu']);
  // combinada: 1 de cada + más de S/ 50
  const r2 = repartirVenta([pinsir, chari, pika, ratt], precioDe, reglas({ unaDeCada: true, mayorPrecio: { activo: true, tipo: 'limite', limite: 50, n: 0 } }));
  assert.deepEqual(r2.lineas.map(l => [l.cartaId, l.publicar, l.quedan]), [['pinsir', 4, 1], ['charizard', 0, 2], ['pikachu', 0, 3], ['rattata', 3, 1]]);
  assert.equal(r2.total, 4 * 12 + 3 * 1.5);
  // las 2 más caras
  const r3 = repartirVenta([pinsir, chari, pika, ratt], precioDe, reglas({ unaDeCada: false, mayorPrecio: { activo: true, tipo: 'topN', limite: 0, n: 2 } }));
  assert.deepEqual(r3.lineas.map(l => [l.cartaId, l.publicar]), [['pinsir', 5], ['charizard', 0], ['pikachu', 0], ['rattata', 4]]);
});

test('elegir una por una (excluidas) y vender todo', () => {
  const pinsir = entrada('pinsir', 5), chari = entrada('charizard', 2);
  const r = repartirVenta([pinsir, chari], precioDe, reglas({ excluidas: new Set(['charizard']) }));
  assert.deepEqual(r.lineas.map(l => [l.cartaId, l.publicar, l.quedan, l.motivo]), [['pinsir', 4, 1, 'una'], ['charizard', 0, 2, 'mano']]);
  const todo = repartirVenta([pinsir, chari], precioDe, reglas({ modo: 'todo', excluidas: new Set(['charizard']) }));
  assert.deepEqual(todo.lineas.map(l => [l.cartaId, l.publicar, l.quedan]), [['pinsir', 5, 0], ['charizard', 2, 0]]);
  assert.equal(todo.publican, 7); assert.equal(todo.quedan, 0); assert.equal(todo.total, 5 * 12 + 2 * 320); assert.equal(todo.conFoto, 1);
});
