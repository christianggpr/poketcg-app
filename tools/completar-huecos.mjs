#!/usr/bin/env node
/**
 * Construye tools/huecos-completados.json: los datos de las cartas que faltaban en la base de v1
 * ("Carta N.º X — sin datos"), recogidos el 30-09-2026 de Limitless (limitlesstcg.com) y Bulbapedia.
 * El generador del catálogo (generar-catalogo.mjs) usa ese archivo para sustituir las casillas vacías.
 *
 *   node tools/completar-huecos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dex = (() => { const window = {}; new Function('window', fs.readFileSync(path.join(here, 'fuente-v1-dex.js'), 'utf8'))(window); return window.DEX_DB; })();
const jaADex = new Map(dex.map(s => [s[3], s[0]]));
const dexAEn = new Map(dex.map(s => [s[0], s[1]]));

const TIPOS = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless', Y: 'Fairy' };

// Nombres en inglés de entrenadores/energías japonesas (traducciones oficiales del TCG)
const EN = {
  'エレキジェネレーター': 'Electric Generator', 'スーパーエネルギー回収': 'Superior Energy Retrieval', 'すごいつりざお': 'Super Rod', 'ネストボール': 'Nest Ball',
  'ネモのリュック': "Nemona's Backpack", 'ハイパーボール': 'Ultra Ball', 'はげましのてがみ': 'Letter of Encouragement', 'ふしぎなアメ': 'Rare Candy',
  '岩のむねあて': 'Rock Chestplate', '大きなふうせん': 'Big Air Balloon', 'ガチガチバンド': 'Hard Charm', 'たべのこし': 'Leftovers',
  'ポケパッド': 'Poké Pad', 'リーリエの決心': "Lillie's Determination", 'おいわいファンファーレ': 'Celebratory Fanfare', 'ガイ': 'ガイ',
  '基本草エネルギー': 'Grass Energy', '基本炎エネルギー': 'Fire Energy', '基本水エネルギー': 'Water Energy', '基本雷エネルギー': 'Lightning Energy',
  '基本超エネルギー': 'Psychic Energy', '基本闘エネルギー': 'Fighting Energy', '基本悪エネルギー': 'Darkness Energy', '基本鋼エネルギー': 'Metal Energy',
  'ジャンボアイス': 'Jumbo Ice Cream', 'ポケギア3.0': 'Pokégear 3.0', 'ふうせん': 'Air Balloon', 'ウエートレス': 'Waitress', 'タケシのスカウト': "Brock's Scouting",
  'ボスの指令': "Boss's Orders", 'マツバの確信': "Morty's Conviction", 'ネモ': 'Nemona'
};

// [número, nombre JP, "tipo etapa" | categoría de entrenador/energía, rareza, HP, ilustrador, marca de regulación] — Limitless
const LIMITLESS = {
  'jp-SV4a': [[127, 'シルシュルー', 'D Basic', '', 50, 'Akira Komayama', 'G'], [128, 'タギングル', 'D Stage 1', '', 90, 'Souichirou Gunjima', 'G'], [129, 'ハッサム', 'M Stage 1', '', 140, 'otumami', 'G'], [130, 'ブロロン', 'M Basic', '', 60, 'Tetsu Kayama', 'G'], [131, 'ブロロローム', 'M Stage 1', '', 140, 'DOM', 'G'], [132, 'テツノワダチex', 'M Basic', 'Double Rare', 220, 'toriyufu', 'G'], [133, 'サーフゴー', 'M Stage 1', '', 130, 'Mitsuhiro Arita', 'G'], [134, 'オンバット', 'N Basic', '', 70, 'chibi', 'G'], [135, 'オンバーンex', 'N Stage 1', 'Double Rare', 260, 'Nisota Niso', 'G'], [136, 'モトトカゲ', 'N Basic', '', 120, 'GIDORA', 'G'], [137, 'ポッポ', 'C Basic', '', 50, 'Oswaldo KATO', 'G'], [138, 'ピジョン', 'C Stage 1', '', 80, 'Oswaldo KATO', 'G'], [139, 'ピジョットex', 'C Stage 2', 'Double Rare', 280, 'takuyoa', 'G'], [140, 'プリン', 'C Basic', '', 70, 'saino misaki', 'G'], [141, 'プクリンex', 'C Stage 1', 'Double Rare', 250, 'Saki Hayashiro', 'G'], [142, 'ドードー', 'C Basic', '', 70, 'Anesaki Dynamic', 'G'], [143, 'ドードリオ', 'C Stage 1', '', 100, 'Anesaki Dynamic', 'G'], [144, 'メタモン', 'C Basic', '', 60, 'KIYOTAKA OSHIYAMA', 'G'], [145, 'カビゴン', 'C Basic', '', 150, 'HYOGONOSUKE', 'G'], [146, 'キャモメ', 'C Basic', '', 70, 'Kouki Saitou', 'G'], [148, 'ホシガリス', 'C Basic', '', 60, 'HYOGONOSUKE', 'G'], [149, 'ヨクバリス', 'C Stage 1', '', 120, 'kantaro', 'G'], [150, 'グルトン', 'C Basic', '', 70, 'Mina Nakai', 'G'], [151, 'パフュートン', 'C Stage 1', '', 130, 'Akira Komayama', 'G'], [152, 'ワッカネズミ', 'C Basic', '', 30, 'Oswaldo KATO', 'G'], [153, 'イッカネズミ', 'C Stage 1', '', 70, 'KIYOTAKA OSHIYAMA', 'G'], [154, 'イキリンコex', 'C Basic', 'Double Rare', 160, 'PLANETA Mochizuki', 'G'], [155, 'カラミンゴ', 'C Basic', '', 110, 'nagimiso', 'G'], [156, 'エレキジェネレーター', 'Item', '', null, 'Toyste Beach', 'G'], [157, 'スーパーエネルギー回収', 'Item', '', null, 'Studio Bora Inc.', 'G'], [158, 'すごいつりざお', 'Item', '', null, 'Toyste Beach', 'G'], [159, 'ネストボール', 'Item', '', null, 'Toyste Beach', 'G'], [160, 'ネモのリュック', 'Item', '', null, 'AYUMI ODASHIMA', 'G'], [161, 'ハイパーボール', 'Item', '', null, 'Ayaka Yoshida', 'G'], [162, 'はげましのてがみ', 'Item', '', null, 'Toyste Beach', 'G'], [163, 'ふしぎなアメ', 'Item', '', null, 'Studio Bora Inc.', 'G'], [164, '岩のむねあて', 'Tool', '', null, 'Toyste Beach', 'G'], [165, '大きなふうせん', 'Tool', '', null, 'Toyste Beach', 'G'], [166, 'ガチガチバンド', 'Tool', '', null, 'Toyste Beach', 'G'], [167, 'たべのこし', 'Tool', '', null, 'Studio Bora Inc.', 'G']],
  'jp-M-P': [[135, 'ポケパッド', 'Item', '', null, 'Studio Bora Inc.', 'J'], [136, 'ガイ', 'Supporter', '', null, 'Teeziro', 'J'], [145, 'リーリエの決心', 'Supporter', '', null, 'Atsushi Furusawa', 'I'], [146, 'メガタブンネex', 'C Basic', '', 270, '5ban Graphics', 'J'], [147, 'おいわいファンファーレ', 'Stadium', '', null, 'Yuu Nishida', 'J'], [148, 'アローラ ナッシー', 'G Stage 1', '', 150, 'yuu', 'J'], [149, 'ファイヤー', 'R Basic', '', 120, 'Krgc', 'J'], [150, 'フリーザー', 'W Basic', '', 120, 'Taira Akitsu', 'J'], [151, 'ゲッコウガex', 'W Stage 2', '', 300, '5ban Graphics', 'J'], [152, 'サンダー', 'L Basic', '', 120, 'SIE NANAHARA', 'J'], [153, 'ニンフィアex', 'P Stage 1', '', 270, '5ban Graphics', 'J'], [154, 'ルカリオ', 'F Stage 1', '', 120, 'Taiga Kasai', 'J'], [156, '基本草エネルギー', 'Basic Energy', '', null, '', ''], [157, '基本炎エネルギー', 'Basic Energy', '', null, '', ''], [158, '基本水エネルギー', 'Basic Energy', '', null, '', ''], [159, '基本雷エネルギー', 'Basic Energy', '', null, '', ''], [160, '基本超エネルギー', 'Basic Energy', '', null, '', ''], [161, '基本闘エネルギー', 'Basic Energy', '', null, '', ''], [162, '基本悪エネルギー', 'Basic Energy', '', null, '', ''], [163, '基本鋼エネルギー', 'Basic Energy', '', null, '', '']],
  'ecard2': [[50, 'Golduck', 'W Stage 1', 'Uncommon', 70, 'Sumiyoshi Kizuki', ''], [74, 'Drowzee', 'P Basic', 'Common', 50, 'Hisao Nakamura', ''], [95, 'Mr. Mime', 'P Basic', 'Common', 50, 'Yukiko Baba', ''], [103, 'Porygon', 'C Basic', 'Common', 40, 'Masako Yamashita', '']]
};

// Bulbapedia: cartas que Limitless no tiene. { n (inglés), nj (japonés), c, t, hp, r, il, rm }
const BULBAPEDIA = {
  'jp-S12a-251': { n: 'Grass Energy', nj: '基本草エネルギー', c: 'E', r: 'Ultra Rare', rm: 'F' },
  'jp-S12a-252': { n: 'Fire Energy', nj: '基本炎エネルギー', c: 'E', r: 'Ultra Rare', rm: 'F' },
  'jp-S12a-253': { n: 'Water Energy', nj: '基本水エネルギー', c: 'E', r: 'Ultra Rare', rm: 'F' },
  'jp-S12a-254': { n: 'Lightning Energy', nj: '基本雷エネルギー', c: 'E', r: 'Ultra Rare', rm: 'F' },
  'jp-M-P-052': { n: 'Poké Pad', nj: 'ポケパッド', c: 'T', r: 'Promo' },
  'jp-M-P-077': { n: 'Jumbo Ice Cream', nj: 'ジャンボアイス', c: 'T', r: 'Promo' },
  'jp-M-P-078': { n: 'Ultra Ball', nj: 'ハイパーボール', c: 'T', r: 'Promo' },
  'jp-M-P-079': { n: 'Rare Candy', nj: 'ふしぎなアメ', c: 'T', r: 'Promo' },
  'jp-M-P-080': { n: 'Pokégear 3.0', nj: 'ポケギア3.0', c: 'T', r: 'Promo' },
  'jp-M-P-081': { n: 'Air Balloon', nj: 'ふうせん', c: 'T', r: 'Promo' },
  'jp-M-P-082': { n: 'Waitress', nj: 'ウエートレス', c: 'T', r: 'Promo' },
  'jp-M-P-083': { n: "Brock's Scouting", nj: 'タケシのスカウト', c: 'T', r: 'Promo' },
  'jp-M-P-084': { n: "Boss's Orders", nj: 'ボスの指令', c: 'T', r: 'Promo' },
  'jp-SV-P-147': { n: "Morty's Conviction", nj: 'マツバの確信', c: 'T', r: 'Promo', rm: 'H' },
  'jp-SV-P-154': { n: 'Nemona', nj: 'ネモ', c: 'T', r: 'Promo', rm: 'H' },
  'mep-111': { n: 'Masquerain', c: 'P', t: ['Grass'], hp: 110, dex: [284], r: 'Promo' },
  'mep-112': { n: 'Magmortar', c: 'P', t: ['Fire'], hp: 140, dex: [467], r: 'Promo' },
  'mep-113': { n: 'Enamorus', c: 'P', t: ['Psychic'], hp: 120, dex: [905], r: 'Promo', il: 'Anesaki Dynamic' },
  'mep-114': { n: 'Kommo-o', c: 'P', t: ['Dragon'], hp: 160, dex: [784], r: 'Promo' },
  'mep-115': { n: 'Spritzee', c: 'P', t: ['Psychic'], hp: 70, dex: [682], r: 'Promo', il: 'Pani Kobayashi' },
  'mep-116': { n: 'Seel', c: 'P', t: ['Water'], hp: 80, dex: [86], r: 'Promo', il: 'Kanami Ogata' },
  'mep-117': { n: 'Kyogre', c: 'P', t: ['Water'], hp: 150, dex: [382], r: 'Promo', il: 'Anderson' },
  'jp-VS1-077': { n: "Will's Slowking", nj: 'イツキのヤドキング', c: 'P', t: ['Psychic'], hp: 70, dex: [199], r: 'Common', il: 'Kagemaru Himeno' },
  'jp-VS1-142': { n: "Rocket's Tyranitar", nj: 'R団のバンギラス', c: 'P', t: ['Darkness'], hp: 80, dex: [248], r: 'Rare Holo' },
  'jp-web1-039': { n: "Team Rocket's Meowth", nj: 'ロケット団のニャース', c: 'P', t: ['Colorless'], hp: 40, dex: [52], r: 'Rare' }
};

// Nombre japonés de un Pokémon → especie (sin "ex", "メガ", "アローラ ")
function especie(nj) {
  const base = nj.replace(/ex$/, '').replace(/^メガ/, '').replace(/^アローラ\s*/, '').trim();
  const d = jaADex.get(base);
  if (!d) throw new Error('especie desconocida: ' + nj);
  let en = dexAEn.get(d);
  if (/^メガ/.test(nj)) en = 'Mega ' + en;
  if (/^アローラ/.test(nj)) en = 'Alolan ' + en;
  if (/ex$/.test(nj)) en += ' ex';
  return { dex: d, en };
}

const out = {};
for (const [setId, filas] of Object.entries(LIMITLESS)) {
  const ja = setId.startsWith('jp-');
  const pad = setId === 'ecard2' ? 0 : 3;
  for (const [num, nombre, tipo, rareza, hp, ilus, rm] of filas) {
    const id = `${setId}-${pad ? String(num).padStart(pad, '0') : num}`;
    const rec = {};
    const m = /^([A-Z]) (Basic|Stage 1|Stage 2)$/.exec(tipo);
    if (m) {
      rec.c = 'P'; rec.t = [TIPOS[m[1]]];
      if (ja) { const e = especie(nombre); rec.dex = [e.dex]; rec.n = e.en; rec.nj = nombre; }
      else { rec.n = nombre; }
    } else if (/Energy/.test(tipo)) { rec.c = 'E'; rec.nj = ja ? nombre : undefined; rec.n = ja ? EN[nombre] || nombre : nombre; }
    else { rec.c = 'T'; rec.nj = ja ? nombre : undefined; rec.n = ja ? EN[nombre] || nombre : nombre; }
    if (hp) rec.hp = hp;
    if (ilus) rec.il = ilus;
    if (rm) rec.rm = rm;
    if (rareza) rec.r = rareza === 'Double Rare' ? 'Double rare' : rareza;
    else if (setId === 'jp-M-P') rec.r = 'Promo';
    if (setId === 'ecard2') rec.p = `ecard2-${num}`;
    rec.sinTcgdex = true;
    out[id] = rec;
  }
}
for (const [id, rec] of Object.entries(BULBAPEDIA)) {
  // comprobación: el número de Pokédex debe corresponder a la especie del nombre
  if (rec.dex) { const en = dexAEn.get(rec.dex[0]); if (!en || !rec.n.includes(en)) throw new Error(`${id}: dex ${rec.dex[0]} es ${en}, no ${rec.n}`); }
  out[id] = { ...rec, sinTcgdex: true };
}

for (const rec of Object.values(out)) for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
const ordenado = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
fs.writeFileSync(path.join(here, 'huecos-completados.json'), JSON.stringify(ordenado, null, 1) + '\n');
console.log(`${Object.keys(ordenado).length} cartas completadas → tools/huecos-completados.json`);
