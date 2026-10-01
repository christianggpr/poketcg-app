// Mejoras 3 · A y B: portadas (colores, contraste, logo) y patrones (aleatorio por día, intensidad).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLORES_PORTADA, PASTELES, colorPastelDe, colorPortada, contraste, marcaAgua, mezclarConOscuro, textoSobre } from '../src/lib/portadas.ts';
import { FONDOS, MARCAS_AGUA, PATRONES, opacidadDeIntensidad, patronAleatorio, patronDeFondo } from '../src/lib/patrones.ts';
import { urlsLogo } from '../src/lib/catalogo.ts';
import type { Coleccion } from '../src/lib/catalogo.ts';

test('portada de colección: color suave estable por colección; logo TCGdex → pokemontcg.io; japonesas sin logo', () => {
  const sv = { id: 'sv03.5', s: 'sv' } as Coleccion;
  assert.equal(colorPastelDe(sv), colorPastelDe({ id: 'sv03.5', s: 'sv' }));
  assert.ok((PASTELES as readonly string[]).includes(colorPastelDe(sv)));
  assert.deepEqual(urlsLogo({ ...sv, p: 'sv3pt5' } as Coleccion), ['https://assets.tcgdex.net/en/sv/sv03.5/logo.webp', 'https://images.pokemontcg.io/sv3pt5/logo.png']);
  assert.deepEqual(urlsLogo({ id: 'base1', s: 'base' } as Coleccion), ['https://assets.tcgdex.net/en/base/base1/logo.webp']);
  assert.deepEqual(urlsLogo({ id: 'jp-SV5a', tid: 'SV5a', s: 'SV', rg: 'ja' } as Coleccion), []);
  assert.deepEqual(urlsLogo(undefined), []);
});

test('álbum propio: 8 colores, color y marca por defecto si faltan o no valen', () => {
  assert.equal(COLORES_PORTADA.length, 8);
  assert.equal(colorPortada(undefined), '#1F5FCC');
  assert.equal(colorPortada('rojo'), '#1F5FCC');
  assert.equal(colorPortada('#e2571e'), '#E2571E');
  assert.equal(marcaAgua(null), 'emblema');
  assert.equal(marcaAgua('olas'), 'olas');
  assert.equal(marcaAgua('pokebola'), 'emblema');
  assert.deepEqual(MARCAS_AGUA.map(m => m.id), ['emblema', 'llamas', 'olas', 'hojas', 'rayos', 'estrellas', 'ninguna']);
});

test('contraste del nombre sobre la portada ≥ 4.5:1 en los 8 colores (blanco con sombreado, u oscuro sobre dorado)', () => {
  for (const c of COLORES_PORTADA) {
    const t = textoSobre(c);
    const fondo = t.sombreado ? mezclarConOscuro(c, 0.5) : c;   // el sombreado oscurece el pie al 50 %
    assert.ok(contraste(t.color, fondo) >= 4.5, `${c}: ${t.color} sobre ${fondo} = ${contraste(t.color, fondo).toFixed(2)}`);
  }
  assert.deepEqual(textoSobre('#C99A00'), { color: '#1C2340', sombreado: false }, 'dorado: texto oscuro');
  assert.deepEqual(textoSobre('#1C2340'), { color: '#FFFFFF', sombreado: false });
  assert.deepEqual(textoSobre('#E2571E'), { color: '#FFFFFF', sombreado: true }, 'naranja: blanco con sombreado');
  assert.ok(contraste('#FFFFFF', '#1F5FCC') > 5.5 && contraste('#FFFFFF', '#1F5FCC') < 6.5);
});

test('fondos: Liso + 5 patrones + Aleatorio; Aleatorio cambia por día; intensidad 40 → opacidad 0.08', () => {
  assert.deepEqual(FONDOS.map(f => f.id), ['liso', 'llamas', 'olas', 'hojas', 'rayos', 'estrellas', 'aleatorio']);
  assert.equal(PATRONES.length, 5);
  const d1 = new Date(2026, 9, 1), d2 = new Date(2026, 9, 2), d6 = new Date(2026, 9, 6);
  assert.notEqual(patronAleatorio(d1), patronAleatorio(d2));
  assert.equal(patronAleatorio(d1), patronAleatorio(d6), 'cada 5 días se repite el ciclo');
  assert.equal(patronDeFondo('liso'), null);
  assert.equal(patronDeFondo('hojas'), 'hojas');
  assert.equal(patronDeFondo('aleatorio', d1), patronAleatorio(d1));
  assert.equal(opacidadDeIntensidad(40), 0.08);
  assert.equal(opacidadDeIntensidad(0), 0);
  assert.equal(opacidadDeIntensidad(100), 0.2);
  assert.equal(opacidadDeIntensidad(NaN), 0.08);
  assert.equal(opacidadDeIntensidad(250), 0.2);
});
