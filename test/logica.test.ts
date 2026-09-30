// Pruebas de la lógica pura (búsqueda, ubicación en cajas, validación, precios).
//   npm test   (Node 22+: node --test test/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Catalogo, numKey, numNorm, cmpKeys, ordenarCartas, nombreCarta, urlsImagen, type DatosCatalogo } from '../src/lib/catalogo.ts';
import { buscarCatalogo, buscarColeccion, parseQuery } from '../src/lib/buscar.ts';
import { Ubicador, posicionesCaja, agruparPorColeccion, type Caja, type Entrada } from '../src/lib/coleccion.ts';
import { validarRegistro, validarPerfil, ocultarDni } from '../src/lib/validar.ts';
import { parsearPrecio, valorDe, fmtUsd } from '../src/lib/precios-core.ts';

const datos = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'catalogo.json'), 'utf8')) as DatosCatalogo;
const cat = new Catalogo(datos);

const caja = (id: string, orden: number, modo: 'auto' | 'manual' = 'auto', oc: 'asc' | 'desc' = 'asc'): Caja => ({ id, usuario_id: 'u', nombre: 'Caja ' + orden, descripcion: '', orden, modo, orden_colecciones: oc, creado_en: '2026-01-01', actualizado_en: '2026-01-01' });
let n = 0;
const entrada = (carta_id: string | null, caja_id: string, extra: Partial<Entrada> = {}): Entrada => ({ id: 'e' + ++n, usuario_id: 'u', carta_id, personalizada: null, caja_id, cantidad: 1, acabado: '', idioma: '', condicion: '', nota: '', posicion: null, creado_en: new Date(2026, 0, 1, 0, n).toISOString(), actualizado_en: '', ...extra });

test('el catálogo carga con índices coherentes', () => {
  assert.equal(cat.sets.length, 322);
  assert.ok(cat.cards.length > 34000);
  const pika = cat.carta('sv03.5-025');
  assert.ok(pika && pika.n === 'Pikachu');
  assert.equal(cat.setOf(pika!)?.ab, 'MEW');
  assert.equal(cat.cartasDe('sv03.5').length, 207);
  assert.equal(cat.especie(25)?.[2], 'Pikachu');
  // casillas sin datos generadas (las que aún no tienen fuente) y huecos completados a mano
  const sd = cat.carta('mep-118');
  assert.ok(sd && sd.sd === true && sd.n === 'Carta N.º 118');
  const completada = cat.carta('jp-SV4a-127');
  assert.ok(completada && !completada.sd && completada.n === 'Shroodle' && completada.nj === 'シルシュルー' && completada.dex?.[0] === 944);
});

test('claves de número', () => {
  assert.deepEqual(numKey('025'), [0, '', 25, '']);
  assert.deepEqual(numKey('TG12'), [1, 'TG', 12, '']);
  assert.deepEqual(numKey('?'), [2, '?', 0, '']);
  assert.equal(numNorm('025'), '25');
  assert.equal(numNorm('tg01'), 'TG1');
  assert.ok(cmpKeys(numKey('9'), numKey('10')) < 0);
  assert.ok(cmpKeys(numKey('100'), numKey('TG1')) < 0);
});

test('búsqueda: nombre, número con total, colección, japonés', () => {
  const r1 = buscarCatalogo(cat, 'pikachu 151');
  assert.ok(r1.length > 0 && r1[0].card.n === 'Pikachu' && r1[0].card.s === 'sv03.5');
  const r2 = buscarCatalogo(cat, '025/165');
  assert.ok(r2.slice(0, 3).some(x => x.card.id === 'sv03.5-025'));
  const r3 = buscarCatalogo(cat, 'リザードン');
  assert.ok(r3.length > 0 && r3.every(x => (x.card.nj || '').includes('リザードン')));
  const r4 = buscarCatalogo(cat, 'charizard jp');
  assert.ok(r4.length > 0 && r4.every(x => cat.setOf(x.card)?.rg === 'ja'));
  const r5 = buscarCatalogo(cat, 'sv03.5-006');
  assert.equal(r5[0].card.id, 'sv03.5-006');
  // las casillas sin datos van al final
  const r6 = buscarCatalogo(cat, 'carta 127');
  assert.ok(r6.length === 0 || !r6[0].card.sd || r6.every(x => x.card.sd));
  assert.deepEqual(parseQuery('#25 pikachu').tokens.map(t => t.kind), ['num', 'text']);
});

test('búsqueda en la colección (catálogo y personalizadas)', () => {
  const es = [entrada('sv03.5-025', 'c1'), entrada(null, 'c1', { personalizada: { nombre: 'Promo Lima', coleccion: 'Evento', numero: '001' } })];
  assert.equal(buscarColeccion(cat, es, 'pikachu').length, 1);
  assert.equal(buscarColeccion(cat, es, 'lima').length, 1);
  assert.equal(buscarColeccion(cat, es, '1 evento').length, 1);
  assert.equal(buscarColeccion(cat, es, 'charizard').length, 0);
});

test('posiciones en una caja automática: por fecha de colección y número', () => {
  const c1 = caja('c1', 1);
  const es = [entrada('sv03.5-041', 'c1'), entrada('sv03.5-025', 'c1'), entrada('base1-4', 'c1'), entrada('jp-SV2a-025', 'c1'), entrada(null, 'c1', { personalizada: { nombre: 'X', coleccion: 'Promo', numero: '3' } })];
  const pos = posicionesCaja(cat, c1, es, 'es');
  assert.deepEqual(pos.lista.map(p => p.entrada.carta_id), ['base1-4', 'jp-SV2a-025', 'sv03.5-025', 'sv03.5-041', null]);
  assert.equal(pos.lista[2].idx, 3);
  const u = new Ubicador(cat, [c1, caja('c2', 2)], es, 'es');
  const loc = u.ubicacion(es[1])!;
  assert.equal(loc.idx, 3);
  assert.equal(loc.total, 5);
  assert.equal(loc.anterior?.carta_id, 'jp-SV2a-025');
  assert.equal(loc.siguiente?.carta_id, 'sv03.5-041');
  assert.equal(loc.ordinalCaja, 1);
  assert.equal(loc.seccion, '151');
  // nuevas primero
  const posDesc = posicionesCaja(cat, caja('c1', 1, 'auto', 'desc'), es, 'es');
  assert.deepEqual(posDesc.lista.slice(0, 2).map(p => p.entrada.carta_id), ['sv03.5-025', 'sv03.5-041']);
});

test('posiciones en una caja manual: por posición asignada', () => {
  const c = caja('m', 1, 'manual');
  const es = [entrada('sv03.5-025', 'm', { posicion: 5 }), entrada('base1-4', 'm', { posicion: 2 })];
  const pos = posicionesCaja(cat, c, es, 'es');
  assert.deepEqual(pos.lista.map(p => p.entrada.carta_id), ['base1-4', 'sv03.5-025']);
});

test('orden de cartas y agrupación por colección', () => {
  const cartas = ['sv03.5-025', 'base1-4', 'sv03.5-006'].map(id => cat.carta(id)!);
  assert.deepEqual(ordenarCartas(cat, cartas, 'name', 'en').map(c => c.n), ['Charizard', 'Charizard ex', 'Pikachu']);
  assert.deepEqual(ordenarCartas(cat, cartas, 'dex', 'en').map(c => c.dex?.[0]), [6, 6, 25]);
  assert.deepEqual(ordenarCartas(cat, cartas, 'set', 'en').map(c => c.id), ['base1-4', 'sv03.5-006', 'sv03.5-025']);
  const grupos = agruparPorColeccion(cat, cartas.map(c => entrada(c.id, 'c1')), 'es');
  assert.deepEqual(grupos.map(g => g.key), ['sv03.5', 'base1']);
  assert.equal(nombreCarta(cat.carta('base1-4')!, 'es'), 'Charizard');
});

test('imágenes: internacional, japonesa y sin datos', () => {
  const c = cat.carta('sv03.5-025')!;
  assert.ok(urlsImagen(c, cat.setOf(c))[0].includes('assets.tcgdex.net/en/sv/sv03.5/025/low.webp'));
  const j = cat.carta('jp-SV2a-025')!;
  assert.ok(urlsImagen(j, cat.setOf(j))[0].includes('/ja/SV/SV2a/025/low.webp'));
  assert.equal(urlsImagen(cat.carta('mep-118')!, cat.setOf(cat.carta('mep-118')!)).length, 0);
});

test('validación del registro', () => {
  const ok = validarRegistro({ nombres: ' Ana ', apellidos: 'Pérez', username: 'Ana_01', email: 'ANA@correo.pe ', telefono: '987 654 321', dni: '12345678', password: 'secreta123', aceptaTerminos: true });
  assert.ok(ok.ok);
  if (ok.ok) { assert.equal(ok.datos.email, 'ana@correo.pe'); assert.equal(ok.datos.telefono, '987654321'); assert.equal(ok.datos.nombres, 'Ana'); }
  const mal = validarRegistro({ nombres: 'A', apellidos: '', username: 'a b', email: 'no', telefono: '812345678', dni: '1234', password: 'corta', aceptaTerminos: false });
  assert.ok(!mal.ok);
  if (!mal.ok) assert.deepEqual(Object.keys(mal.errores).sort(), ['aceptaTerminos', 'apellidos', 'dni', 'email', 'nombres', 'password', 'telefono', 'username']);
  assert.ok(validarPerfil({ nombres: 'Ana', apellidos: 'Pérez', username: 'ana', telefono: '', idioma_nombres: 'ja' }).ok);
  assert.equal(ocultarDni('12345678'), '••••5678');
});

test('precios: TCGplayer por acabado y Cardmarket convertido', () => {
  const rec = parsearPrecio('x', { pricing: { tcgplayer: { normal: { marketPrice: 1.5 }, 'reverse-holofoil': { marketPrice: 4.25 } }, cardmarket: { trend: 2 } } });
  assert.ok(rec.ok && rec.tp && rec.tp.normal === 1.5);
  assert.equal(valorDe(rec, 'Reverse')?.usd, 4.25);
  assert.equal(valorDe(rec, 'Normal')?.usd, 1.5);
  assert.equal(valorDe(rec, 'Holo')?.usd, 4.25); // aproximado
  assert.equal(valorDe(rec, 'Holo')?.approx, true);
  const cm = parsearPrecio('y', { pricing: { cardmarket: { trend: 10, 'trend-holo': 30 } } });
  assert.equal(valorDe(cm, '', 1.1)?.usd, 11);
  assert.equal(valorDe(cm, 'Holo', 1.1)?.usd, 33);
  assert.equal(valorDe(parsearPrecio('z', {}), ''), null);
  assert.equal(fmtUsd(3.5), 'US$ 3.50');
  assert.equal(fmtUsd(null), '—');
});
