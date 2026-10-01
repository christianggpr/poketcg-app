// Pruebas de la lógica pura (búsqueda, ubicación en cajas, validación, precios).
//   npm test   (Node 22+: node --test test/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Catalogo, numKey, numNorm, cmpKeys, ordenarCartas, nombreCarta, urlsImagen, urlsImagenGrande, urlLimitlessJa, idiomaImagen, type DatosCatalogo, type Carta, type Coleccion } from '../src/lib/catalogo.ts';
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

test('imágenes (Mejoras 2 · A): idioma del álbum, listas sin imagen de TCGdex y otras fuentes', () => {
  const intl: Coleccion = { id: 'xx1', n: 'Prueba', s: 'sv', sn: 'SV', cc: 10, ct: 10, d: '2026-01-01', ab: 'XX', ien: ['005', '007'], ies: ['007'] };
  const c1: Carta = { id: 'xx1-001', s: 'xx1', l: '001', n: 'Uno', c: 'P', p: 'xx1-1' };
  const c5: Carta = { id: 'xx1-005', s: 'xx1', l: '005', n: 'Cinco', c: 'P', p: 'xx1-5' };
  const c7: Carta = { id: 'xx1-007', s: 'xx1', l: '007', n: 'Siete', c: 'P', im: ['limitless', 'https://limitless/XX_007_R_EN_LG.png'] };
  // álbum EN: inglés primero, luego pokemontcg.io
  assert.deepEqual(urlsImagen(c1, intl), ['https://assets.tcgdex.net/en/sv/xx1/001/low.webp', 'https://images.pokemontcg.io/xx1/1.png']);
  // álbum ES: español primero (existe), inglés después
  assert.deepEqual(urlsImagen(c1, intl, 'es').slice(0, 2), ['https://assets.tcgdex.net/es/sv/xx1/001/low.webp', 'https://assets.tcgdex.net/en/sv/xx1/001/low.webp']);
  // sin inglés en TCGdex: se usa el español aunque el álbum sea EN; pokemontcg.io después; inglés al final por si acaso
  assert.deepEqual(urlsImagen(c5, intl), ['https://assets.tcgdex.net/es/sv/xx1/005/low.webp', 'https://images.pokemontcg.io/xx1/5.png', 'https://assets.tcgdex.net/en/sv/xx1/005/low.webp']);
  // sin TCGdex en ningún idioma ni pokemontcg.io: la otra fuente guardada en el catálogo
  assert.equal(urlsImagen(c7, intl)[0], 'https://limitless/XX_007_R_EN_LG.png');
  assert.equal(urlsImagenGrande(c7, intl)[0], 'https://limitless/XX_007_R_EN.png');
  assert.equal(urlsImagenGrande(c1, intl)[0], 'https://assets.tcgdex.net/en/sv/xx1/001/high.webp');
  assert.ok(urlsImagenGrande(c1, intl).includes('https://images.pokemontcg.io/xx1/1_hires.png'));
  // japonesa sin imágenes en TCGdex (ija = 0): Limitless con el número sin ceros y el código sin guiones
  const jp: Coleccion = { id: 'jp-SV-P', tid: 'SV-P', n: 'Promo', s: 'SV', sn: 'SV', cc: 10, ct: 10, d: '2026-01-01', rg: 'ja', ija: 0 };
  const j: Carta = { id: 'jp-SV-P-025', s: 'jp-SV-P', l: '025', n: 'Pikachu', c: 'P', rg: 'ja' };
  assert.equal(urlLimitlessJa(j, jp), 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SVP/SVP_25_R_JP_LG.png');
  assert.equal(urlLimitlessJa(j, jp, true), 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SVP/SVP_25_R_JP.png');
  assert.deepEqual(urlsImagen(j, jp), ['https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SVP/SVP_25_R_JP_LG.png', 'https://assets.tcgdex.net/ja/SV/SV-P/025/low.webp']);
  // japonesa con imagen en TCGdex: TCGdex primero
  const jp2: Coleccion = { ...jp, id: 'jp-S12a', tid: 'S12a', ija: ['250'] };
  assert.equal(urlsImagen({ ...j, id: 'jp-S12a-025', s: 'jp-S12a' }, jp2)[0], 'https://assets.tcgdex.net/ja/SV/S12a/025/low.webp');
  assert.equal(urlsImagen({ ...j, id: 'jp-S12a-250', s: 'jp-S12a', l: '250' }, jp2)[0], 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/S12a/S12a_250_R_JP_LG.png');
  assert.equal(idiomaImagen('ES'), 'es'); assert.equal(idiomaImagen('EN'), 'auto'); assert.equal(idiomaImagen(null), 'auto');
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

test('Fase 2: precio por defecto = máx(piso, mercado) en soles', async () => {
  const { precioDefectoPen, valorMercadoPen, esBrillante, fmtPen, netoVendedor, parsearPrecio: pp } = await import('../src/lib/precios-core.ts');
  const ajustes = { fx: { usd_pen: 4, eur_pen: 4.5 }, pisos: { normal: 1, especial: 2 }, comision: 0.05 };
  const comun = { r: 'Common', n: 'Pidgey' };
  const holo = { r: 'Holo Rare', n: 'Charizard' };
  const ex = { r: 'Double rare', n: 'Charizard ex' };
  // mercado S/ 0.40 (US$ 0.10) en carta normal → piso S/ 1
  const rec1 = pp('a', { pricing: { tcgplayer: { normal: { marketPrice: 0.1 } } } });
  assert.equal(valorMercadoPen(rec1, 'Normal', ajustes.fx)?.pen, 0.4);
  assert.deepEqual([precioDefectoPen(comun, 'Normal', rec1, ajustes).pen, precioDefectoPen(comun, 'Normal', rec1, ajustes).origen], [1, 'piso']);
  // holo con mercado S/ 1.50 → piso S/ 2
  const rec2 = pp('b', { pricing: { tcgplayer: { holofoil: { marketPrice: 0.375 } } } });
  assert.equal(precioDefectoPen(holo, 'Holo', rec2, ajustes).pen, 2);
  assert.equal(precioDefectoPen(comun, 'Reverse', rec2, ajustes).pen, 2);   // reverse siempre especial
  // mercado S/ 12 → S/ 12
  const rec3 = pp('c', { pricing: { tcgplayer: { normal: { marketPrice: 3 } } } });
  assert.deepEqual([precioDefectoPen(ex, '', rec3, ajustes).pen, precioDefectoPen(ex, '', rec3, ajustes).origen], [12, 'mercado']);
  // Cardmarket en euros → soles
  const rec4 = pp('d', { pricing: { cardmarket: { trend: 2 } } });
  assert.equal(valorMercadoPen(rec4, '', ajustes.fx)?.pen, 9);
  // sin precio de mercado → piso según la carta
  assert.equal(precioDefectoPen(comun, '', null, ajustes).pen, 1);
  assert.equal(precioDefectoPen(ex, '', null, ajustes).pen, 2);
  assert.equal(esBrillante({ r: 'Rare', n: 'Pikachu V' }, 'Normal'), true);
  assert.equal(esBrillante({ r: 'Uncommon', n: 'Potion' }, ''), false);
  assert.equal(fmtPen(1250.5), 'S/ 1,250.50');
  assert.equal(netoVendedor(100, 0.05), 95);
});
