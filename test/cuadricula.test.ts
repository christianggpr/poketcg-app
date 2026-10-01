// Ajustes de layout 2 · 4: cuadrícula elegible de la hoja del álbum (opciones por modo, valores por defecto, normalización).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, opcionesDe, OPCIONES_CELULAR, OPCIONES_PC, OPCIONES_PC_DOBLE, POR_DEFECTO_CELULAR, POR_DEFECTO_PC } from '../src/components/useCuadricula.ts';

test('opciones: PC 3×3 · 3×4 · 4×4 · 4×5 · 4×6 (con 2 páginas hasta 4×4); celular 3×3 · 3×4 · 4×5', () => {
  assert.deepEqual(OPCIONES_PC.map(o => o.id), ['3x3', '3x4', '4x4', '4x5', '4x6']);
  assert.deepEqual(OPCIONES_PC_DOBLE.map(o => o.id), ['3x3', '3x4', '4x4']);
  assert.deepEqual(OPCIONES_CELULAR.map(o => o.id), ['3x3', '3x4', '4x5']);
  assert.equal(opcionesDe(true, 2), OPCIONES_PC_DOBLE);
  assert.equal(opcionesDe(true, 1), OPCIONES_PC);
  assert.equal(opcionesDe(false, 2), OPCIONES_CELULAR);
});

test('por defecto: PC 4×5 en 1 página, celular 3×3', () => {
  assert.deepEqual(POR_DEFECTO_PC, { cols: 4, filas: 5, paginas: 1 });
  assert.deepEqual(POR_DEFECTO_CELULAR, { cols: 3, filas: 3, paginas: 1 });
  assert.deepEqual(normalizar(null, true), POR_DEFECTO_PC);
  assert.deepEqual(normalizar(undefined, false), POR_DEFECTO_CELULAR);
  assert.deepEqual(normalizar({ cols: 'x' as unknown as number }, true), POR_DEFECTO_PC);
});

test('normalizar: respeta una elección válida, baja a 4×4 con 2 páginas, ignora 2 páginas en el celular y opciones ajenas al modo', () => {
  assert.deepEqual(normalizar({ cols: 3, filas: 4, paginas: 1 }, true), { cols: 3, filas: 4, paginas: 1 });
  assert.deepEqual(normalizar({ cols: 4, filas: 5, paginas: 2 }, true), { cols: 4, filas: 4, paginas: 2 }, '4×5 con 2 páginas → 4×4');
  assert.deepEqual(normalizar({ cols: 4, filas: 6, paginas: 2 }, true), { cols: 4, filas: 4, paginas: 2 });
  assert.deepEqual(normalizar({ cols: 3, filas: 3, paginas: 2 }, true), { cols: 3, filas: 3, paginas: 2 });
  assert.deepEqual(normalizar({ cols: 4, filas: 5, paginas: 2 }, false), { cols: 4, filas: 5, paginas: 1 }, 'el celular no tiene 2 páginas');
  assert.deepEqual(normalizar({ cols: 4, filas: 6, paginas: 1 }, false), POR_DEFECTO_CELULAR, '4×6 no existe en el celular');
  assert.deepEqual(normalizar({ cols: 5, filas: 5, paginas: 1 }, true), POR_DEFECTO_PC, '5×5 no existe');
});
