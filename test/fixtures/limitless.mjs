// Páginas de Limitless simuladas con la misma estructura HTML que las reales (sept. 2026).
// Las usan las pruebas unitarias y test/mock-supabase.mjs (LIMITLESS_BASE=http://127.0.0.1:54321/limitless).

export const ARQUETIPOS = [
  { id: 284, nombre: 'Dragapult ex', iconos: ['dragapult'], puntos: 30052, cuota: 10.46 },
  { id: 255, nombre: 'Gardevoir ex', iconos: ['gardevoir'], puntos: 21434, cuota: 7.46 },
  { id: 247, nombre: 'Lugia Archeops', iconos: ['lugia', 'archeops'], puntos: 13045, cuota: 4.54 }
];

/** Cartas de prueba: [set, número, copias, nombre, categoría] con códigos reales del catálogo. */
const MEW = (num, n, nombre, cat = 'P') => [ 'MEW', num, n, nombre, cat ];
export const LISTAS = {
  // Dragapult: dos listas casi iguales (variante 1) y una distinta (variante 2, "Dragapult Dusknoir")
  29182: { puesto: 1, jugador: 'Edmund Khoo', torneo: '26th September 2026 - Regional Brisbane', iconos: ['dragapult'], cartas: [
    MEW('025', 4, 'Pikachu'), MEW('004', 4, 'Charmander'), MEW('001', 3, 'Bulbasaur'), MEW('010', 2, 'Caterpie'), MEW('007', 3, 'Squirtle'),
    ['MEW', '150', 4, 'Mewtwo', 'P'], ['MEW', '133', 4, 'Eevee', 'P'], ['MEW', '143', 2, 'Snorlax', 'P'],
    ['MEW', '152', 4, 'Antique Dome Fossil', 'T'], ['MEW', '153', 4, 'Antique Helix Fossil', 'T'], ['MEW', '154', 4, 'Antique Old Amber', 'T'],
    ['MEW', '155', 4, 'Big Air Balloon', 'T'], ['MEW', '156', 3, 'Bill\'s Transfer', 'T'], ['MEW', '157', 3, 'Cycling Road', 'T'],
    ['SVE', '005', 8, 'Basic Psychic Energy', 'E'], ['SVE', '002', 4, 'Basic Fire Energy', 'E']
  ] },
  28936: { puesto: 2, jugador: 'Yoshiyuki Yamaguchi', torneo: '26th September 2026 - Regional Brisbane', iconos: ['dragapult'], cartas: [
    MEW('025', 4, 'Pikachu'), MEW('004', 4, 'Charmander'), MEW('001', 3, 'Bulbasaur'), MEW('010', 2, 'Caterpie'), MEW('007', 3, 'Squirtle'),
    ['MEW', '150', 4, 'Mewtwo', 'P'], ['MEW', '133', 4, 'Eevee', 'P'], ['MEW', '143', 2, 'Snorlax', 'P'],
    ['MEW', '152', 4, 'Antique Dome Fossil', 'T'], ['MEW', '153', 4, 'Antique Helix Fossil', 'T'], ['MEW', '154', 4, 'Antique Old Amber', 'T'],
    ['MEW', '155', 4, 'Big Air Balloon', 'T'], ['MEW', '156', 2, 'Bill\'s Transfer', 'T'], ['MEW', '157', 2, 'Cycling Road', 'T'], ['MEW', '158', 2, 'Daisy\'s Help', 'T'],
    ['SVE', '005', 8, 'Basic Psychic Energy', 'E'], ['SVE', '002', 4, 'Basic Fire Energy', 'E']
  ] },
  29476: { puesto: 3, jugador: 'Brent Tonisson', torneo: '26th September 2026 - Regional Brisbane', iconos: ['dragapult', 'dusknoir'], cartas: [
    MEW('025', 4, 'Pikachu'), MEW('004', 4, 'Charmander'), MEW('001', 3, 'Bulbasaur'),
    ['MEW', '092', 4, 'Gastly', 'P'], ['MEW', '093', 3, 'Haunter', 'P'], ['MEW', '094', 3, 'Gengar', 'P'], ['MEW', '150', 4, 'Mewtwo', 'P'],
    ['MEW', '152', 4, 'Antique Dome Fossil', 'T'], ['MEW', '153', 4, 'Antique Helix Fossil', 'T'], ['MEW', '159', 4, 'Energy Sticker', 'T'],
    ['MEW', '160', 4, 'Erika\'s Invitation', 'T'], ['MEW', '161', 3, 'Giovanni\'s Charisma', 'T'], ['MEW', '162', 4, 'Grabber', 'T'],
    ['SVE', '005', 8, 'Basic Psychic Energy', 'E'], ['SVE', '002', 4, 'Basic Fire Energy', 'E']
  ] },
  // Gardevoir: una sola lista
  31001: { puesto: 5, jugador: 'Ana Pérez', torneo: '20th September 2026 - Regional Lima', iconos: ['gardevoir'], cartas: [
    ['MEW', '150', 4, 'Mewtwo', 'P'], ['MEW', '151', 2, 'Mew ex', 'P'], ['MEW', '025', 4, 'Pikachu', 'P'], ['MEW', '133', 4, 'Eevee', 'P'],
    ['MEW', '152', 4, 'Antique Dome Fossil', 'T'], ['MEW', '153', 4, 'Antique Helix Fossil', 'T'], ['MEW', '154', 4, 'Antique Old Amber', 'T'],
    ['MEW', '155', 4, 'Big Air Balloon', 'T'], ['MEW', '156', 4, 'Bill\'s Transfer', 'T'], ['MEW', '157', 4, 'Cycling Road', 'T'], ['MEW', '158', 4, 'Daisy\'s Help', 'T'],
    ['MEW', '159', 4, 'Energy Sticker', 'T'], ['SVE', '005', 14, 'Basic Psychic Energy', 'E']
  ] },
  // Lugia: una lista
  31002: { puesto: 9, jugador: 'Beto Ruiz', torneo: '20th September 2026 - Regional Lima', iconos: ['lugia', 'archeops'], cartas: [
    ['MEW', '143', 4, 'Snorlax', 'P'], ['MEW', '133', 4, 'Eevee', 'P'], ['MEW', '007', 4, 'Squirtle', 'P'],
    ['MEW', '152', 4, 'Antique Dome Fossil', 'T'], ['MEW', '153', 4, 'Antique Helix Fossil', 'T'], ['MEW', '154', 4, 'Antique Old Amber', 'T'],
    ['MEW', '155', 4, 'Big Air Balloon', 'T'], ['MEW', '156', 4, 'Bill\'s Transfer', 'T'], ['MEW', '157', 4, 'Cycling Road', 'T'], ['MEW', '158', 4, 'Daisy\'s Help', 'T'],
    ['MEW', '159', 4, 'Energy Sticker', 'T'], ['SVE', '002', 16, 'Basic Fire Energy', 'E']
  ] }
};
// La lista 29182 aparece dos veces (como en Limitless, cuando el mismo jugador la usa en dos torneos): debe guardarse una sola vez.
export const LISTAS_POR_ARQUETIPO = { 284: [29182, 28936, 29476, 29182], 255: [31001], 247: [31002] };

export function paginaDecks() {
  const filas = ARQUETIPOS.map((a, i) => `<tr>
            <td>${i + 1}</td>
            <td>${a.iconos.map(ic => `<img class="pokemon" src="https://r2.limitlesstcg.net/pokemon/gen9/${ic}.png" alt="${ic}">`).join('')}</td>
            <td><a href="/decks/${a.id}">${a.nombre.replace(/ (ex)$/, ' <span class="annotation">$1</span>')}${/ ex$/.test(a.nombre) ? '' : ' <span class="annotation"></span>'}</a></td>
            <td>${a.puntos}</td>
            <td>${a.cuota}%</td>
        </tr>`).join('\n');
  return `<!DOCTYPE html><html><head><title>Decks – Limitless</title></head><body><div class="content"><table class="data-table striped">
    <tr>
        <th>#</th>
        <th></th>
        <th>Deck</th>
        <th>Points</th>
        <th>Share</th>
    </tr>
${filas}
</table></div></body></html>`;
}

export function paginaArquetipo(id) {
  const ids = LISTAS_POR_ARQUETIPO[id] || [];
  let torneo = '';
  const filas = [];
  for (const lid of ids) {
    const l = LISTAS[lid];
    if (l.torneo !== torneo) { torneo = l.torneo; filas.push(`<tr>\n                <th class="sub-heading" colspan="5">\n                    <a href="/tournaments/578">${torneo}</a>\n                </th>\n            </tr>`); }
    const sufijo = l.puesto === 1 ? 'st' : l.puesto === 2 ? 'nd' : l.puesto === 3 ? 'rd' : 'th';
    filas.push(`<tr> <td><img class="format" src="https://limitless3.nyc3.cdn.digitaloceanspaces.com/formats/standard.png" alt="standard" data-tooltip="Standard"></td> <td>${l.puesto}${sufijo}</td> <td>${l.iconos.map(ic => `<img class="pokemon" src="https://r2.limitlesstcg.net/pokemon/gen9/${ic}.png" alt="${ic}">`).join('')}</td> <td><a href="/players/1">${l.jugador}</a></td> <td> <a href="/decks/list/${lid}"><i class="far fa-lg fa-list-alt"></i></a> </td> </tr>`);
  }
  const a = ARQUETIPOS.find(x => x.id === id);
  return `<!DOCTYPE html><html><head><title>${a ? a.nombre : id} - Deck Overview – Limitless</title></head><body>
<div class="deck-overview"><h1>${a ? a.nombre : id}</h1><table><tr><th>Variant</th></tr><tr><td>x</td></tr></table></div>
<h3>Latest results</h3>
<table class="data-table">
<tr>
        <th></th>
        <th>Place</th>
        <th>Variant</th>
        <th>Player</th>
        <th>List</th>
    </tr>
${filas.join('\n')}
</table></body></html>`;
}

export function paginaLista(id) {
  const l = LISTAS[id];
  if (!l) return null;
  const col = (titulo, cat) => {
    const cartas = l.cartas.filter(c => c[4] === cat);
    if (!cartas.length) return '';
    const n = cartas.reduce((s, c) => s + c[2], 0);
    return `                <div class="decklist-column">
    <div class="decklist-column-heading">${titulo} (${n})</div>
${cartas.map(c => `            <div class="decklist-card" data-set="${c[0]}" data-number="${String(parseInt(c[1], 10))}" data-lang="en"${cat === 'E' ? ' data-basic-energy="1"' : ''}>
            <a class="card-link" href="/cards/${c[0]}/${c[1]}">
                <span class="card-count">${c[2]}</span>
                <span class="card-name">${c[3].replace(/'/g, '&#039;')}</span>
                 <img class="set" alt="${c[0]}" src="https://s3.limitlesstcg.com/sets/en/${c[0]}_SM.png" data-tooltip="Set">                             </a>
             <a class="card-price usd" href="https://partner.tcgplayer.com/x" target="_blank">$0.10</a>         </div>`).join('\n')}
    </div>`;
  };
  return `<!DOCTYPE html><html><head><title>Deck by ${l.jugador} – Limitless</title></head><body>
<div class="decklist" data-id="1">
    <div class="decklist-top">
        <div class="decklist-title">
            Mazo de prueba
                            <a class="decklist-price card-price usd external" href="https://partner.tcgplayer.com/x" target="_blank">1.00$</a>
        </div>
        <div class="decklist-options"><div class="vv-buttons hidden"><button data-export="" data-tooltip="Copy to Clipboard"></button></div></div>
    </div>
    <div data-text-decklist="">
        <div class="decklist-main">
            <div class="decklist-cards layout1">
${col('Pokémon', 'P')}
${col('Trainer', 'T')}
${col('Energy', 'E')}
            </div>
        </div>
    </div>
    <div class="hidden" data-image-decklist=""><div class="decklist-visual embed light"><div class="card-grid">
${l.cartas.map(c => `<div class="decklist-visual-card"><a href="/cards/${c[0]}/${c[1]}"><img class="card-picture card" src="https://x/${c[0]}_${c[1]}.png" alt="${c[3]}"><img class="card-count" src="https://x/${c[2]}.png" alt="${c[2]}"></a></div>`).join('\n')}
    </div></div></div>
</div>
<div class="decklist-results"><h3>Decklist played by</h3></div>
</body></html>`;
}
