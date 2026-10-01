#!/usr/bin/env node
/**
 * Valida las imágenes del catálogo (Mejoras 2 · bloque A).
 *
 * Comprueba, carta por carta, en qué fuente pública existe su imagen, en este orden:
 *   1. TCGdex (assets.tcgdex.net): en inglés para las colecciones internacionales (y también en español,
 *      para los álbumes en ES) y en japonés para las japonesas.
 *   2. pokemontcg.io (images.pokemontcg.io): internacionales con id de pokemontcg.io (campo p).
 *   3. Limitless (limitlesstcg.nyc3.cdn.digitaloceanspaces.com): japonesas desde la era BW (2011) e
 *      internacionales con código impreso (campo ab).
 * Las colecciones japonesas de 1996–2006 (PMCG, neo, VS, web, e, PCG) no están en ninguna fuente pública
 * con dirección predecible: se informan aparte.
 *
 * Escribe:
 *   tools/imagenes.json        – por colección, los números SIN imagen en TCGdex (en / es / ja); por carta,
 *                                la imagen de otra fuente (origen + URL pequeña + URL grande); lista sin imagen.
 *   tools/informe-imagenes.txt – resumen por colección, porcentaje total y la lista de cartas sin imagen.
 * Después, tools/generar-catalogo.mjs incorpora imagenes.json al catálogo (campos ien / ies / ija de cada
 * colección y im de cada carta), que es lo que usa la app para pedir la imagen correcta a la primera.
 *
 * Necesita internet. Se ejecuta en GitHub (Actions → "Imágenes del catálogo" → Run workflow) o a mano:
 *   node tools/validar-imagenes.mjs                    # todo el catálogo (unos 10 minutos)
 *   node tools/validar-imagenes.mjs --solo sv03.5,jp-SV4a
 *   node tools/validar-imagenes.mjs --sin-api          # sin el atajo de la API de TCGdex: comprueba cada imagen
 *   node tools/validar-imagenes.mjs --concurrencia 8
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(here, '..');
const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
const solo = typeof opcion('--solo') === 'string' ? new Set(opcion('--solo').split(',').map(s => s.trim()).filter(Boolean)) : null;
const sinApi = !!opcion('--sin-api');
const CONCURRENCIA = Number(opcion('--concurrencia')) || 12;

const API = 'https://api.tcgdex.net/v2';
const ASSETS = 'https://assets.tcgdex.net';
const PTCGIO = 'https://images.pokemontcg.io';
const LIMITLESS = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com';
const UA = 'PokeTCG-validador-imagenes/1 (+https://poketcg.pe)';
// Limitless tiene cartas japonesas desde la era BW (2011): las series anteriores no existen allí.
const SERIES_JP_LIMITLESS = new Set(['BW', 'XY', 'SM', 'S', 'SV', 'M']);
const SERIES_JP_SIN_FUENTE = new Set(['PMCG', 'neo', 'VS', 'web', 'e', 'PCG']);

const cat = JSON.parse(fs.readFileSync(path.join(raiz, 'public', 'data', 'catalogo.json'), 'utf8'));
const porSet = new Map();
for (const c of cat.cards) { if (!porSet.has(c.s)) porSet.set(c.s, []); porSet.get(c.s).push(c); }

const espera = (ms) => new Promise(r => setTimeout(r, ms));
/** '025' → '25', 'tg01' → 'TG1': para comparar números con los de la API. */
const norm = (l) => { const m = /^([A-Za-z]*)0*(\d+)([A-Za-z]*)$/.exec(String(l || '').trim()); return m ? `${m[1].toUpperCase()}${parseInt(m[2], 10)}${m[3].toLowerCase()}` : String(l || '').toUpperCase(); };
const numKey = (l) => { const m = /^([A-Za-z]*)0*(\d+)([A-Za-z]*)$/.exec(String(l || '').trim()); return m ? [m[1] ? 1 : 0, m[1].toUpperCase(), parseInt(m[2], 10), m[3]] : [2, String(l || ''), 0, '']; };
const cmp = (a, b) => { const x = numKey(a), y = numKey(b); for (let i = 0; i < 4; i++) { if (x[i] === y[i]) continue; return typeof x[i] === 'number' ? x[i] - y[i] : String(x[i]) < String(y[i]) ? -1 : 1; } return 0; };
const fmtNum = (n) => n.toLocaleString('es-PE');
const pct = (a, b) => (b ? (100 * a / b).toFixed(2).replace('.', ',') : '0,00') + ' %';

let peticiones = 0, errores = 0;

/** Ejecuta fn sobre los elementos con un máximo de n a la vez. */
async function enLotes(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); }
  }));
  return res;
}

/** ¿Existe la imagen? 'ok' | 'no' | 'error' (red o servidor, tras reintentos). */
async function existe(url) {
  for (let intento = 0; intento < 4; intento++) {
    try {
      peticiones++;
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return 'ok';
      // 403: DigitalOcean Spaces responde 403 a las claves que no existen
      if (r.status === 404 || r.status === 403 || r.status === 410) return 'no';
      if (r.status === 405 || r.status === 501) {
        const g = await fetch(url, { headers: { 'user-agent': UA, range: 'bytes=0-0' }, signal: AbortSignal.timeout(20000) });
        if (g.ok) return 'ok';
        if (g.status === 404 || g.status === 403 || g.status === 410) return 'no';
      }
      if (r.status === 429) { await espera(4000 * (intento + 1)); continue; }
    } catch { /* red: se reintenta */ }
    await espera(800 * (intento + 1));
  }
  errores++;
  return 'error';
}

/** Lista de cartas de una colección en la API de TCGdex (números con imagen), o null si no se pudo consultar. */
async function setApi(lang, id) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      peticiones++;
      const r = await fetch(`${API}/${lang}/sets/${encodeURIComponent(id)}`, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      if (r.status === 404) return { existe: false, conImagen: new Set() };
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const cartas = Array.isArray(j.cards) ? j.cards : [];
      return { existe: true, conImagen: new Set(cartas.filter(c => c.image).map(c => norm(c.localId))), total: cartas.length };
    } catch { await espera(1200 * (intento + 1)); }
  }
  errores++;
  return null;
}

const urlTcgdex = (s, lang, l, calidad = 'low') => `${ASSETS}/${lang}/${s.s}/${s.tid || s.id}/${l}/${calidad}.webp`;
const urlPtcgio = (c, grande = false) => { const i = c.p.indexOf('-'); return `${PTCGIO}/${c.p.slice(0, i)}/${c.p.slice(i + 1)}${grande ? '_hires' : ''}.png`; };
/** Limitless japonés: código sin guiones (SV-P → SVP) y número sin ceros a la izquierda. */
const urlLimitlessJp = (s, c, grande = false) => { if (!s.tid || !/^\d+$/.test(c.l)) return null; const code = s.tid.replace(/-/g, ''); return `${LIMITLESS}/tpc/${code}/${code}_${parseInt(c.l, 10)}_R_JP${grande ? '' : '_LG'}.png`; };
/** Limitless internacional: código impreso (MEW) y número de tres cifras. */
const urlLimitlessIntl = (s, c, grande = false) => { if (!s.ab || !/^\d+$/.test(c.l)) return null; return `${LIMITLESS}/tpci/${s.ab}/${s.ab}_${String(parseInt(c.l, 10)).padStart(3, '0')}_R_EN${grande ? '' : '_LG'}.png`; };

const sets = cat.sets.filter(s => !solo || solo.has(s.id));
const salida = { generado: new Date().toISOString(), catalogo: cat.version, sets: {}, cartas: {}, sinImagen: [], resumen: {} };
const fuentesTotal = { tcgdex: 0, 'tcgdex-es': 0, pokemontcg: 0, limitless: 0, ninguna: 0 };
let total = 0, conImagen = 0, totalConFuente = 0, conImagenConFuente = 0, sinDatos = 0, yaEnTcgdex = [];
const lineas = [];
const t0 = Date.now();

for (let k = 0; k < sets.length; k++) {
  const s = sets[k];
  const cartas = (porSet.get(s.id) || []).filter(c => !c.sd).slice().sort((a, b) => cmp(a.l, b.l));
  sinDatos += (porSet.get(s.id) || []).filter(c => c.sd).length;
  const ja = s.rg === 'ja';
  const idiomas = ja ? ['ja'] : ['en', 'es'];
  const idTcgdex = s.tid || s.id;
  const estado = {}; // idioma → Map(l → 'ok' | 'no' | 'error')
  const info = {};   // idioma → { existe, sin }
  for (const lang of idiomas) {
    const api = sinApi ? null : await setApi(lang, idTcgdex);
    const positivos = api ? api.conImagen : new Set();
    const m = new Map();
    const aProbar = [];
    for (const c of cartas) { if (positivos.has(norm(c.l))) m.set(c.l, 'ok'); else aProbar.push(c); }
    // Español (idioma secundario): si la API no da ninguna imagen, se prueba una muestra repartida; si ninguna existe,
    // se da por hecho que no hay (ahorra miles de peticiones). En el idioma principal se comprueba carta por carta.
    let probar = aProbar;
    if (lang === 'es' && api && positivos.size === 0 && aProbar.length > 8) {
      const paso = Math.max(1, Math.floor(aProbar.length / 6));
      const muestra = aProbar.filter((_, i) => i % paso === 0).slice(0, 8);
      const r = await enLotes(muestra, 4, c => existe(urlTcgdex(s, lang, c.l)));
      if (!r.includes('ok')) { for (const c of aProbar) m.set(c.l, r.includes('error') ? 'error' : 'no'); probar = []; }
    }
    const res = await enLotes(probar, CONCURRENCIA, c => existe(urlTcgdex(s, lang, c.l)));
    probar.forEach((c, i) => m.set(c.l, res[i]));
    estado[lang] = m;
    const sin = cartas.filter(c => m.get(c.l) !== 'ok').map(c => c.l);
    const ok = cartas.length - sin.length;
    info[lang] = { existe: ok > 0, con: ok, sin: ok > 0 ? sin : [] };
  }
  // Respaldos para las que no tienen imagen en TCGdex en el idioma principal
  const fuentes = { tcgdex: 0, 'tcgdex-es': 0, pokemontcg: 0, limitless: 0, ninguna: 0 };
  const sinImagenSet = [];
  const principal = ja ? 'ja' : 'en';
  const pendientes = cartas.filter(c => estado[principal].get(c.l) !== 'ok');
  for (const c of cartas) if (estado[principal].get(c.l) === 'ok') { fuentes.tcgdex++; if (c.sinTcgdex) yaEnTcgdex.push(c.id); }
  await enLotes(pendientes, Math.max(2, Math.floor(CONCURRENCIA / 2)), async c => {
    if (!ja) {
      if (estado.es.get(c.l) === 'ok') { fuentes['tcgdex-es']++; return; }
      if (c.p && (await existe(urlPtcgio(c))) === 'ok') { fuentes.pokemontcg++; return; }
      const lim = urlLimitlessIntl(s, c);
      if (lim && (await existe(lim)) === 'ok') { fuentes.limitless++; salida.cartas[c.id] = ['limitless', lim, urlLimitlessIntl(s, c, true)]; return; }
    } else if (SERIES_JP_LIMITLESS.has(s.s)) {
      const lim = urlLimitlessJp(s, c);
      if (lim && (await existe(lim)) === 'ok') { fuentes.limitless++; salida.cartas[c.id] = ['limitless', lim, urlLimitlessJp(s, c, true)]; return; }
    }
    fuentes.ninguna++;
    sinImagenSet.push(c);
  });
  sinImagenSet.sort((a, b) => cmp(a.l, b.l));
  const okSet = cartas.length - sinImagenSet.length;
  const sinFuente = ja && SERIES_JP_SIN_FUENTE.has(s.s);
  total += cartas.length; conImagen += okSet;
  if (!sinFuente) { totalConFuente += cartas.length; conImagenConFuente += okSet; }
  for (const f of Object.keys(fuentes)) fuentesTotal[f] += fuentes[f];
  salida.sets[s.id] = { nombre: s.n, total: cartas.length, conImagen: okSet, sinFuentePublica: sinFuente || undefined, ...info, fuentes, sinImagen: sinImagenSet.map(c => c.l) };
  for (const c of sinImagenSet) salida.sinImagen.push({ id: c.id, s: s.id, l: c.l, n: c.n, nj: c.nj || undefined });
  const detalle = idiomas.map(l => `${l} ${info[l].con}`).join(', ');
  const resp = ['tcgdex-es', 'pokemontcg', 'limitless'].filter(f => fuentes[f]).map(f => `${f} ${fuentes[f]}`).join(', ');
  lineas.push(`${s.id} · ${s.n} · ${okSet}/${cartas.length} (${pct(okSet, cartas.length)}) · TCGdex ${detalle}${resp ? ' · respaldo: ' + resp : ''}${sinImagenSet.length ? ` · sin imagen: ${sinFuente && sinImagenSet.length === cartas.length ? 'todas (sin fuente pública)' : sinImagenSet.map(c => c.l).join(', ')}` : ''}`);
  console.log(`[${k + 1}/${sets.length}] ${lineas[lineas.length - 1]}`);
}

const segundos = Math.round((Date.now() - t0) / 1000);
salida.peticiones = peticiones; salida.errores = errores; salida.segundos = segundos;
salida.yaEnTcgdex = yaEnTcgdex;
salida.resumen = { total, conImagen, pct: total ? Math.round(10000 * conImagen / total) / 100 : 0, conFuentePublica: { total: totalConFuente, conImagen: conImagenConFuente, pct: totalConFuente ? Math.round(10000 * conImagenConFuente / totalConFuente) / 100 : 0 }, sinFuentePublica: total - totalConFuente, sinDatos, fuentes: fuentesTotal };

// Demasiados errores de red → no se escribe nada (el resultado no sería fiable)
if (errores > Math.max(20, peticiones * 0.02)) {
  console.error(`\nDemasiados errores de red (${errores} de ${peticiones} peticiones): no se escribe el resultado. Vuelve a intentarlo más tarde.`);
  process.exit(2);
}

const setsSinFuente = sets.filter(s => s.rg === 'ja' && SERIES_JP_SIN_FUENTE.has(s.s));
const sinImagenConFuente = salida.sinImagen.filter(x => !salida.sets[x.s].sinFuentePublica);
const informe = [
  `Imágenes del catálogo ${cat.version} · comprobado el ${salida.generado.slice(0, 10)} · ${fmtNum(peticiones)} peticiones, ${errores} errores, ${segundos} s`,
  `Cartas comprobadas: ${fmtNum(total)} (sin contar ${sinDatos} casillas "sin datos", que no tienen imagen posible)`,
  `Con imagen: ${fmtNum(conImagen)} (${pct(conImagen, total)}) · sin imagen: ${fmtNum(total - conImagen)}`,
  `  · Colecciones con fuente pública (TCGdex, pokemontcg.io, Limitless): ${fmtNum(conImagenConFuente)} de ${fmtNum(totalConFuente)} con imagen (${pct(conImagenConFuente, totalConFuente)})`,
  `  · Colecciones japonesas de 1996–2006 sin fuente pública (${setsSinFuente.length} colecciones, ${fmtNum(total - totalConFuente)} cartas): sin imagen`,
  `Por fuente: TCGdex ${fmtNum(fuentesTotal.tcgdex)} · TCGdex en español (respaldo) ${fmtNum(fuentesTotal['tcgdex-es'])} · pokemontcg.io ${fmtNum(fuentesTotal.pokemontcg)} · Limitless ${fmtNum(fuentesTotal.limitless)} · ninguna ${fmtNum(fuentesTotal.ninguna)}`,
  yaEnTcgdex.length ? `Cartas completadas a mano que ya están en TCGdex (se les quita la marca sinTcgdex): ${yaEnTcgdex.length}` : '',
  '',
  'Por colección (id · nombre · con imagen/total · TCGdex por idioma · respaldos · sin imagen):',
  ...lineas,
  '',
  `Cartas sin imagen en colecciones con fuente pública (${sinImagenConFuente.length}):`,
  ...(sinImagenConFuente.length ? sinImagenConFuente.map(x => `${x.id} · ${x.l} · ${x.n}${x.nj ? ' · ' + x.nj : ''} · ${salida.sets[x.s].nombre}`) : ['(ninguna)']),
  '',
  `Colecciones japonesas sin fuente pública (${setsSinFuente.length}):`,
  ...setsSinFuente.map(s => `${s.id} · ${s.n} · ${(porSet.get(s.id) || []).filter(c => !c.sd).length} cartas · ${s.d}`),
  ''
].filter(l => l !== null);

if (!solo) {
  fs.writeFileSync(path.join(here, 'imagenes.json'), JSON.stringify(salida));
  fs.writeFileSync(path.join(here, 'informe-imagenes.txt'), informe.join('\n'));
  console.log(`\nEscrito tools/imagenes.json y tools/informe-imagenes.txt`);
} else {
  fs.writeFileSync(path.join(here, 'informe-imagenes-parcial.txt'), informe.join('\n'));
  console.log(`\n(--solo) Escrito tools/informe-imagenes-parcial.txt; imagenes.json no se toca`);
}
console.log(informe.slice(0, 7).join('\n'));
