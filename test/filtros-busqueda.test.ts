// Mejoras 4 · D: filtros compartidos (dirección ↔ filtros, chips) y búsqueda tolerante a errores (sugerencias, "¿Quisiste decir…?", guiones).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Catalogo, type DatosCatalogo } from '../src/lib/catalogo.ts';
import { FILTROS_VACIOS, cartaCumple, chipsDe, cuentaFiltros, entradaCumple, filtrosDeParams, opcionesCatalogo, paramsDeFiltros, quitarFiltro, type ContextoEntrada } from '../src/lib/filtros.ts';
import { buscarCatalogo, distancia, quisisteDecir, sugerencias } from '../src/lib/buscar.ts';

const datos = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'catalogo.json'), 'utf8')) as DatosCatalogo;
const cat = new Catalogo(datos);

test('filtros ↔ dirección: solo los activos, orden fijo, `set=` antiguo, min/max al revés se ordenan, valores raros se ignoran', () => {
  const f = filtrosDeParams(new URLSearchParams('coleccion=sv03.5&tipo=Grass&estado=NM&min=50&max=5&foto=1&donde=album&venta=si&rareza=Rare'));
  assert.equal(f.coleccion, 'sv03.5'); assert.equal(f.tipo, 'Grass'); assert.equal(f.condicion, 'NM'); assert.equal(f.min, 5); assert.equal(f.max, 50);
  assert.equal(f.foto, true); assert.equal(f.reputacion, false); assert.equal(f.donde, 'album'); assert.equal(f.venta, 'si'); assert.equal(f.rareza, 'Rare');
  assert.equal(paramsDeFiltros(f, { q: 'pikachu', orden: 'precio' }).toString(), 'q=pikachu&orden=precio&coleccion=sv03.5&tipo=Grass&rareza=Rare&estado=NM&min=5&max=50&foto=1&donde=album&venta=si');
  assert.deepEqual(filtrosDeParams(new URLSearchParams('set=sv03.5&donde=otro&venta=x&min=abc')), { ...FILTROS_VACIOS, coleccion: 'sv03.5' });
  assert.deepEqual(filtrosDeParams(null), FILTROS_VACIOS);
  assert.equal(paramsDeFiltros(FILTROS_VACIOS).toString(), '');
  assert.equal(cuentaFiltros(f), 8);
  assert.equal(cuentaFiltros(FILTROS_VACIOS), 0);
});

test('chips de filtros activos (con nombres legibles) y quitar uno (el precio quita mín. y máx.)', () => {
  const f = { ...FILTROS_VACIOS, coleccion: 'sv03.5', tipo: 'Fire', condicion: 'NM', min: 5, max: 50, reputacion: true };
  assert.deepEqual(chipsDe(f, cat, 'es').map(c => `${c.clave}:${c.texto}`), ['coleccion:151', 'tipo:Fuego', 'condicion:NM', 'precio:S/ 5 – 50', 'reputacion:Buena reputación']);
  assert.deepEqual(chipsDe({ ...FILTROS_VACIOS, min: 10 }, null).map(c => c.texto), ['desde S/ 10']);
  assert.deepEqual(chipsDe({ ...FILTROS_VACIOS, max: 10 }, null).map(c => c.texto), ['hasta S/ 10']);
  assert.deepEqual(quitarFiltro(f, 'precio'), { ...f, min: null, max: null });
  assert.deepEqual(quitarFiltro(f, 'tipo'), { ...f, tipo: '' });
  assert.deepEqual(quitarFiltro(f, 'reputacion'), { ...f, reputacion: false });
});

test('cartaCumple: colección, tipo (cualquiera de sus tipos), ilustrador (sin mayúsculas/tildes) y rareza', () => {
  const bulb = cat.carta('sv03.5-001')!;
  assert.ok(cartaCumple(bulb, FILTROS_VACIOS));
  assert.ok(cartaCumple(bulb, { ...FILTROS_VACIOS, coleccion: 'sv03.5', tipo: 'Grass' }));
  assert.ok(!cartaCumple(bulb, { ...FILTROS_VACIOS, tipo: 'Fire' }));
  assert.ok(!cartaCumple(bulb, { ...FILTROS_VACIOS, coleccion: 'base1' }));
  assert.ok(cartaCumple(bulb, { ...FILTROS_VACIOS, ilustrador: bulb.il!.toUpperCase() }));
  assert.ok(cartaCumple(bulb, { ...FILTROS_VACIOS, rareza: bulb.r! }));
  assert.ok(!cartaCumple(bulb, { ...FILTROS_VACIOS, rareza: 'Secret Rare' }));
  const op = opcionesCatalogo(cat);
  assert.ok(op.ilustradores.length > 100 && op.ilustradores.some(i => i.nombre === 'Mitsuhiro Arita'));
  assert.ok(op.rarezas.some(r => r.id === 'Common') && op.rarezas[0].cartas >= op.rarezas[1].cartas);
});

test('distancia de edición acotada (con transposición)', () => {
  assert.equal(distancia('charizard', 'charizard'), 0);
  assert.equal(distancia('charisard', 'charizard'), 1);
  assert.equal(distancia('pikachuu', 'pikachu'), 1);
  assert.equal(distancia('evee', 'eevee'), 1);
  assert.equal(distancia('piakchu', 'pikachu'), 1, 'transposición cuenta 1');
  assert.equal(distancia('abc', 'xyz'), 3);
  assert.equal(distancia('abc', 'abcdefgh'), 3, 'por encima del máximo devuelve max + 1');
});

test('sugerencias mientras se escribe: prefijo de palabra, cartas primero, sin repetidos', () => {
  const s = sugerencias(cat, 'pika');
  assert.equal(s[0].tipo, 'carta'); assert.equal(s[0].texto, 'Pikachu');
  assert.ok(s.length <= 8 && new Set(s.map(x => x.tipo + x.texto.toLowerCase())).size === s.length);
  const col = sugerencias(cat, 'obsid');
  assert.ok(col.some(x => x.tipo === 'coleccion' && /Obsidian/.test(x.texto) && x.id === 'sv03'), JSON.stringify(col));
  const il = sugerencias(cat, 'mitsuhiro');
  assert.ok(il.some(x => x.tipo === 'ilustrador' && x.texto === 'Mitsuhiro Arita'));
  assert.deepEqual(sugerencias(cat, 'p'), [], 'con una letra no sugiere');
  assert.deepEqual(sugerencias(cat, '151'), [], 'solo números: no sugiere');
  assert.ok(sugerencias(cat, 'Ho-Oh').some(x => x.texto.toLowerCase() === 'ho-oh'), 'con guion');
  assert.ok(sugerencias(cat, 'hooh').some(x => x.texto.toLowerCase() === 'ho-oh'), 'sin guion');
});

test('"¿Quisiste decir…?": charisard → Charizard, pikachuu → Pikachu, evee → Eevee; nada que corregir → null; con número conserva el número', () => {
  assert.equal(quisisteDecir(cat, 'charisard')?.texto, 'Charizard');
  assert.equal(quisisteDecir(cat, 'charisard')?.consulta, 'Charizard');
  assert.equal(quisisteDecir(cat, 'pikachuu')?.texto, 'Pikachu');
  assert.equal(quisisteDecir(cat, 'evee')?.texto, 'Eevee');
  assert.equal(quisisteDecir(cat, 'pikachu'), null);
  assert.equal(quisisteDecir(cat, 'Charizard ex 151'), null);
  assert.equal(quisisteDecir(cat, 'charisard 151')?.consulta, 'Charizard 151');
  assert.equal(quisisteDecir(cat, 'xqzvw'), null, 'nada parecido');
  assert.equal(quisisteDecir(cat, '025'), null);
});

test('la búsqueda ignora guiones, tildes y mayúsculas: "hooh", "ho oh", "HO-OH" y "Pokémon" = "pokemon"', () => {
  const ids = (q: string) => new Set(buscarCatalogo(cat, q, 400).map(r => r.card.n));
  assert.ok(ids('hooh').has('Ho-Oh'));
  assert.ok(ids('ho-oh').has('Ho-Oh'));
  assert.ok(ids('HO-OH').has('Ho-Oh'));
  assert.ok(ids('ho oh').has('Ho-Oh'));
  assert.ok(buscarCatalogo(cat, 'pokémon card 151', 5).length > 0 && buscarCatalogo(cat, 'POKEMON CARD 151', 5).length > 0);
});

test('entradaCumple: catálogo, idioma, acabado, estado, precio, dónde (álbum/Bulk) y en venta', () => {
  const base = { id: 'e1', usuario_id: 'u', caja_id: 'c1', carta_id: 'sv03.5-001', cantidad: 1, acabado: 'Holo', idioma: 'ES', condicion: 'NM', nota: '', posicion: null, creado_en: '', actualizado_en: '' } as unknown as Parameters<typeof entradaCumple>[1];
  const ctx = { precio: () => 20, donde: (e: { caja_id: string | null }) => (e.caja_id ? ({ tipo: 'caja' } as unknown as ReturnType<ContextoEntrada['donde']>) : ({ tipo: 'coleccion' } as unknown as ReturnType<ContextoEntrada['donde']>)), enVenta: (e: { id: string }) => e.id === 'e1' };
  assert.ok(entradaCumple(cat, base, FILTROS_VACIOS, ctx));
  assert.ok(entradaCumple(cat, base, { ...FILTROS_VACIOS, coleccion: 'sv03.5', tipo: 'Grass', idioma: 'ES', acabado: 'Holo', condicion: 'NM', min: 10, max: 30, donde: 'bulk', venta: 'si' }, ctx));
  assert.ok(!entradaCumple(cat, base, { ...FILTROS_VACIOS, idioma: 'EN' }, ctx));
  assert.ok(!entradaCumple(cat, base, { ...FILTROS_VACIOS, acabado: 'Normal' }, ctx));
  assert.ok(!entradaCumple(cat, base, { ...FILTROS_VACIOS, condicion: 'LP' }, ctx));
  assert.ok(!entradaCumple(cat, base, { ...FILTROS_VACIOS, min: 25 }, ctx));
  assert.ok(!entradaCumple(cat, base, { ...FILTROS_VACIOS, max: 15 }, ctx));
  assert.ok(!entradaCumple(cat, base, { ...FILTROS_VACIOS, donde: 'album' }, ctx));
  assert.ok(entradaCumple(cat, { ...base, caja_id: null }, { ...FILTROS_VACIOS, donde: 'album' }, ctx));
  assert.ok(!entradaCumple(cat, base, { ...FILTROS_VACIOS, venta: 'no' }, ctx));
  assert.ok(entradaCumple(cat, { ...base, id: 'e2' }, { ...FILTROS_VACIOS, venta: 'no' }, ctx));
  assert.ok(!entradaCumple(cat, { ...base, carta_id: null }, { ...FILTROS_VACIOS, tipo: 'Grass' }, ctx), 'una personalizada no pasa filtros de catálogo');
  assert.ok(entradaCumple(cat, { ...base, carta_id: null }, { ...FILTROS_VACIOS, idioma: 'ES' }, ctx), 'pero sí los de la copia');
});
