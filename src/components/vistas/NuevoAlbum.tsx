'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TYPE_ES, TYPE_ORDER, fold, nombreColeccion, type Carta, type Especie } from '@/lib/catalogo';
import { opcionesCatalogo } from '@/lib/filtros';
import { cartaRepresentativa, numeroDex } from '@/lib/pokedex';
import { LIMITE_AUTO, NOMBRE_TIPO, TIPOS_ALBUM, cartasDeTipoAlbum, cuantasTengo, lineaEvolutiva, paginasPara, rellenaSolo, type ParametrosAlbum, type TipoAlbum } from '@/lib/albumes-tipos';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { useToast } from '../Toast';
import { Icono, PuntoEnergia } from '../Icono';
import { Emblema } from '../Portadas';
import { SelectorColeccion, SelectorTexto } from '../Filtros';
import { FormularioAlbumPropio, datosAlbumIniciales, type DatosAlbumPropio } from '../EditorAlbumPropio';
import { Aviso, MiniCarta } from '../ui';

// Mejoras 5 · B (maquetas M5-PC-Nuevo, M5-Nuevo): "Nuevo álbum" es un asistente de 3 pasos.
//   1. ¿De qué es tu álbum? Colección oficial · Un Pokémon · Un tipo · Un ilustrador · Cartas sueltas.
//   2. Detalle según el tipo (colección e idioma / Pokémon con idioma y evoluciones / tipo / ilustrador / nada) con
//      "[N] cartas en el catálogo · tienes [N]".
//   3. Portada y tamaño (Mejoras 3). Al crear: los de Pokémon, colección e ilustrador (hasta 300) se rellenan solos;
//      los de tipo (y los ilustradores con muchas) empiezan vacíos con sugerencias. Las cartas que ya tengo se ven como
//      "tengo" sin moverlas; el álbum ofrece ponerlas ahí ("¿Ponerlas en este álbum?").

const IDIOMAS_POKEMON = [['', 'Todos'], ['EN', 'EN'], ['ES', 'ES'], ['JP', 'JP']] as const;
const IDIOMAS_COLECCION = ['EN', 'ES', 'JP', 'PT', 'FR', 'DE', 'IT'];

export function NuevoAlbum() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const router = useRouter();
  const idiomaN = perfil.idioma_nombres;
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [tipo, setTipo] = useState<TipoAlbum | null>(null);
  const [p, setP] = useState<ParametrosAlbum>({ idioma: '' });
  const [datos, setDatos] = useState<DatosAlbumPropio>(() => datosAlbumIniciales({ paginas: 2 }));
  const [creando, setCreando] = useState(false);
  const cambiar = (parte: Partial<ParametrosAlbum>) => setP(x => ({ ...x, ...parte }));

  // cartas del catálogo que le tocan al álbum y cuántas tengo
  const cartas = useMemo(() => (tipo ? cartasDeTipoAlbum(cat, tipo, p) : []), [cat, tipo, p]);
  const tengo = useMemo(() => cuantasTengo(cartas, col.entradas), [cartas, col.entradas]);
  const relleno = tipo ? rellenaSolo(tipo, cartas.length) : false;
  const necesarias = relleno && tipo !== 'coleccion' ? paginasPara(cartas.length, datos.columnas, datos.filas) : null;
  // las páginas se ajustan solas a lo que hace falta (el usuario puede subirlas)
  useEffect(() => { if (necesarias != null) setDatos(d => (d.paginas < necesarias ? { ...d, paginas: necesarias } : d)); }, [necesarias]);

  const ilustradores = useMemo(() => opcionesCatalogo(cat).ilustradores.map(i => ({ id: i.nombre, texto: i.nombre, detalle: `${i.cartas} cartas` })), [cat]);
  const muestra = useMemo(() => cartaRepresentativa(cat, cartas), [cat, cartas]);   // carta de muestra del resumen
  const especie = p.dex ? cat.especie(p.dex) : undefined;
  const nombreEspecie = (sp: Especie) => (idiomaN === 'ja' ? sp[3] : idiomaN === 'es' ? sp[2] : sp[1]) || sp[1];
  const listo2 = tipo === 'libre' || (tipo === 'coleccion' && !!p.set && !!p.idioma) || (tipo === 'pokemon' && !!p.dex) || (tipo === 'tipo' && !!p.tipo) || (tipo === 'ilustrador' && !!p.ilustrador);
  // nombre sugerido según el tipo (se puede cambiar en el paso 3)
  const nombreSugerido = tipo === 'pokemon' && especie ? `${nombreEspecie(especie)}${p.evoluciones ? ' y evoluciones' : ''}` : tipo === 'tipo' && p.tipo ? `Tipo ${TYPE_ES[p.tipo] || p.tipo}` : tipo === 'ilustrador' ? p.ilustrador || '' : tipo === 'coleccion' && p.set ? nombreColeccion(cat.coleccion(p.set), idiomaN) : '';
  const irA3 = () => { setDatos(d => ({ ...d, nombre: d.nombre || nombreSugerido })); setPaso(3); };
  const siguiente = () => { if (paso === 1 && tipo) { if (tipo === 'libre') irA3(); else setPaso(2); } else if (paso === 2 && listo2) irA3(); };

  async function crear() {
    if (!tipo || creando) return;
    setCreando(true);
    const parametros: ParametrosAlbum = tipo === 'coleccion' ? { set: p.set, idioma: p.idioma } : tipo === 'pokemon' ? { dex: p.dex, idioma: p.idioma || '', evoluciones: !!p.evoluciones } : tipo === 'tipo' ? { tipo: p.tipo, idioma: p.idioma || '' } : tipo === 'ilustrador' ? { ilustrador: p.ilustrador, idioma: p.idioma || '' } : {};
    const a = await col.crearAlbum({ ...datos, nombre: datos.nombre.trim() || nombreSugerido || 'Álbum', tipo_album: tipo, parametros });
    if (!a) { setCreando(false); toast('No se pudo crear el álbum', 'danger'); return; }
    if (relleno && tipo !== 'coleccion' && cartas.length) await col.asignarBolsillos(a.id, cartas.map((c, i) => ({ indice: i, carta_id: c.id })));
    // si la base aún no tiene las columnas de 0011, la fila vuelve sin tipo_album: el álbum se crea igual pero no recuerda su tipo
    if (tipo !== 'libre' && a.tipo_album == null) toast('Álbum creado. Para que recuerde su tipo (Pokémon, tipo…) hay que pegar 0011_mejoras5b.sql en Supabase.', '', 6000);
    else toast('Álbum creado', 'ok');
    if (tipo === 'coleccion') router.push(`/app/album/${encodeURIComponent(p.set!)}?idioma=${encodeURIComponent(p.idioma || '')}`);
    else router.push(`/app/album/p/${a.id}?nuevo=1`);
  }

  const titulos: Record<1 | 2 | 3, string> = { 1: '¿De qué es tu álbum?', 2: tipo === 'coleccion' ? '¿Qué colección?' : tipo === 'pokemon' ? '¿Qué Pokémon?' : tipo === 'tipo' ? '¿Qué tipo?' : '¿Qué ilustrador?', 3: 'Portada y tamaño' };
  return (
    <div className="nuevo-album" data-testid="nuevo-album">
      <Link href="/app/album" className="miga solo-pc" data-testid="miga-albumes"><Icono n="izquierda" tam={16} /> Mis álbumes</Link>
      <h1 className="titulo-nuevo">Nuevo álbum</h1>
      <div className="small muted paso-nuevo" data-testid="paso-nuevo">Paso {paso} de 3 · {titulos[paso]}</div>

      {paso === 1 ? (
        <div className="tipos-album" role="radiogroup" aria-label="Tipo de álbum" data-testid="tipos-album">
          {TIPOS_ALBUM.map(t => (
            <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} className={`tipo-album ${tipo === t.id ? 'active' : ''}`} onClick={() => { setTipo(t.id); setP({ idioma: '' }); }} onDoubleClick={() => { setTipo(t.id); if (t.id === 'libre') irA3(); else setPaso(2); }} data-testid={`tipo-${t.id}`}>
              <span className="tipo-cabecera" style={{ background: t.color }}><Emblema tam={110} className="tipo-emblema" /><span className="tipo-etiqueta">{t.etiqueta}</span></span>
              <span className="tipo-cuerpo"><b>{t.nombre}</b><span className="meta">{t.detalle}</span></span>
            </button>
          ))}
        </div>
      ) : null}

      {paso === 2 && tipo === 'coleccion' ? (
        <div className="panel paso-detalle" data-testid="paso-coleccion">
          <SelectorColeccion valor={p.set || ''} onChange={v => cambiar({ set: v, idioma: cat.coleccion(v)?.rg === 'ja' ? 'JP' : p.idioma === 'JP' ? '' : p.idioma })} />
          {p.set && cat.coleccion(p.set)?.rg === 'ja' ? <p className="small muted">Colección japonesa: el idioma es <b>JP</b>.</p>
            : <div className="field"><label>Idioma</label><div className="chips-opcion" role="radiogroup" aria-label="Idioma">{IDIOMAS_COLECCION.filter(l => l !== 'JP').map(l => <button key={l} type="button" role="radio" aria-checked={p.idioma === l} className={`chipbtn ${p.idioma === l ? 'active' : ''}`} onClick={() => cambiar({ idioma: l })} data-testid={`idioma-${l}`}>{l}</button>)}</div></div>}
          {p.set ? <Resumen muestra={muestra} cartas={cartas.length} tengo={tengo} /> : null}
        </div>
      ) : null}

      {paso === 2 && tipo === 'pokemon' ? (
        <div className="panel paso-detalle" data-testid="paso-pokemon">
          <BuscadorEspecie valor={p.dex || null} onChange={d => cambiar({ dex: d })} nombre={nombreEspecie} />
          {especie ? <Resumen muestra={muestra} titulo={`${nombreEspecie(especie)} · Nº ${numeroDex(especie[0])}`} cartas={cartas.length} tengo={tengo} /> : null}
          <div className="fila-campos">
            <div className="field"><label>Idioma</label><div className="chips-opcion" role="radiogroup" aria-label="Idioma">{IDIOMAS_POKEMON.map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={(p.idioma || '') === v} className={`chipbtn ${(p.idioma || '') === v ? 'active' : ''}`} onClick={() => cambiar({ idioma: v })} data-testid={`idioma-${v || 'todos'}`}>{t}</button>)}</div></div>
            <div className="field"><label>Incluir</label><div className="chips-opcion"><button type="button" role="checkbox" aria-checked={!!p.evoluciones} className={`chipbtn ${p.evoluciones ? 'active' : ''}`} onClick={() => cambiar({ evoluciones: !p.evoluciones })} data-testid="incluir-evoluciones">Evoluciones{p.dex && lineaEvolutiva(p.dex).length > 1 ? ` (${lineaEvolutiva(p.dex).length - 1})` : ''}</button></div></div>
          </div>
          {p.dex && lineaEvolutiva(p.dex).length <= 1 ? <p className="small muted">Este Pokémon no tiene evoluciones.</p> : null}
        </div>
      ) : null}

      {paso === 2 && tipo === 'tipo' ? (
        <div className="panel paso-detalle" data-testid="paso-tipo">
          <div className="field"><label>Tipo de energía</label><div className="chips-opcion" role="radiogroup" aria-label="Tipo">{TYPE_ORDER.map(t => <button key={t} type="button" role="radio" aria-checked={p.tipo === t} className={`chipbtn ${p.tipo === t ? 'active' : ''}`} onClick={() => cambiar({ tipo: t })} data-testid={`tipo-energia-${t}`}><PuntoEnergia tipo={t} /> {TYPE_ES[t] || t}</button>)}</div></div>
          {p.tipo ? <><Resumen muestra={muestra} titulo={`Tipo ${TYPE_ES[p.tipo] || p.tipo}`} cartas={cartas.length} tengo={tengo} /><p className="small muted">Son muchas: el álbum empieza vacío y tú eliges cuáles agregar desde <b>Acciones → Sugerencias</b> (las que tienes van primero; filtros por colección y rareza).</p></> : null}
        </div>
      ) : null}

      {paso === 2 && tipo === 'ilustrador' ? (
        <div className="panel paso-detalle" data-testid="paso-ilustrador">
          <SelectorTexto label="Ilustrador" valor={p.ilustrador || ''} opciones={ilustradores} placeholder="Buscar ilustrador…" onChange={v => cambiar({ ilustrador: v })} testid="filtro-ilustrador" />
          {p.ilustrador ? <><Resumen muestra={muestra} titulo={p.ilustrador} cartas={cartas.length} tengo={tengo} />{cartas.length > LIMITE_AUTO ? <p className="small muted">Son más de {LIMITE_AUTO}: el álbum empieza vacío y tú eliges cuáles agregar desde <b>Acciones → Sugerencias</b>.</p> : <p className="small muted">Se rellena solo con todas sus cartas, por fecha de colección.</p>}</> : null}
        </div>
      ) : null}

      {paso === 3 ? (
        <div className="panel paso-detalle" data-testid="paso-portada">
          {tipo && tipo !== 'libre' ? <p className="small"><span className="pill info">{NOMBRE_TIPO[tipo]}</span> {tipo === 'coleccion' ? `${nombreColeccion(cat.coleccion(p.set), idiomaN, true)} · ${p.idioma}` : nombreSugerido}{tipo !== 'coleccion' ? ` · ${cartas.length} cartas · tienes ${tengo}` : ''}</p> : null}
          {tipo === 'coleccion' ? <Aviso tipo="info">Un álbum de colección oficial usa la hoja de la colección (todas sus cartas en orden). Solo eliges el nombre con que aparece en Mis álbumes.</Aviso> : null}
          <FormularioAlbumPropio valor={datos} onChange={setDatos} paginasNecesarias={necesarias} nota={tipo === 'coleccion' ? 'Las páginas y la cuadrícula las eliges al abrir el álbum.' : undefined} />
        </div>
      ) : null}

      <div className="pie-nuevo">
        {paso > 1 ? <button type="button" className="btn" onClick={() => setPaso(paso === 3 && tipo === 'libre' ? 1 : (paso - 1) as 1 | 2)} data-testid="btn-atras">Atrás</button> : <Link href="/app/album" className="btn">Cancelar</Link>}
        {paso < 3 ? <button type="button" className="btn primary" disabled={paso === 1 ? !tipo : !listo2} onClick={siguiente} data-testid="btn-siguiente">{paso === 2 ? 'Siguiente: color y tamaño' : 'Siguiente'}</button>
          : <button type="button" className="btn primary" disabled={creando} onClick={crear} data-testid="btn-crear-album">{creando ? 'Creando…' : 'Crear álbum'}</button>}
      </div>
    </div>
  );
}

function Resumen({ muestra, titulo, cartas, tengo }: { muestra?: Carta; titulo?: string; cartas: number; tengo: number }) {
  const cat = useCatalogo();
  return (
    <div className="resumen-tipo" data-testid="resumen-tipo">
      {muestra ? <MiniCarta carta={muestra} set={cat.setOf(muestra)} ancho={36} /> : null}
      <div className="resumen-texto">
        {titulo ? <b>{titulo}</b> : null}
        <span className="meta">{cartas} {cartas === 1 ? 'carta' : 'cartas'} en el catálogo · tienes {tengo}</span>
      </div>
    </div>
  );
}

/** Buscar un Pokémon por nombre (ES/EN/JP) o número de Pokédex. */
function BuscadorEspecie({ valor, onChange, nombre }: { valor: number | null; onChange: (dex: number) => void; nombre: (sp: Especie) => string }) {
  const cat = useCatalogo();
  const [q, setQ] = useState('');
  const lista = useMemo(() => {
    const t = fold(q).trim();
    if (!t) return [];
    const n = parseInt(t, 10);
    const res = cat.species.filter(sp => (Number.isFinite(n) && sp[0] === n) || fold(sp[1]).includes(t) || fold(sp[2]).includes(t) || fold(sp[3]).includes(t));
    return res.sort((a, b) => { const pa = fold(a[1]).startsWith(t) || fold(a[2]).startsWith(t) ? 0 : 1, pb = fold(b[1]).startsWith(t) || fold(b[2]).startsWith(t) ? 0 : 1; return pa - pb || a[0] - b[0]; }).slice(0, 8);
  }, [cat, q]);
  const elegida = valor ? cat.especie(valor) : undefined;
  return (
    <div className="field selector-coleccion" data-testid="buscar-especie">
      <label>Pokémon</label>
      {elegida ? (
        <div className="elegida"><span>{nombre(elegida)} · Nº {numeroDex(elegida[0])}</span><button type="button" className="btn icon sm ghost" onClick={() => { onChange(0); setQ(''); }} aria-label="Quitar el Pokémon" data-testid="quitar-especie"><Icono n="cerrar" tam={16} /></button></div>
      ) : (
        <>
          <input className="input" placeholder="Buscar Pokémon…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar Pokémon" autoFocus data-testid="buscar-especie-input" />
          {lista.length ? <div className="lista-opciones" role="listbox">{lista.map(sp => <button key={sp[0]} type="button" role="option" aria-selected={false} onClick={() => { onChange(sp[0]); setQ(''); }} data-testid="opcion-especie">{nombre(sp)}<small>Nº {numeroDex(sp[0])}{sp[1] !== nombre(sp) ? ` · ${sp[1]}` : ''}</small></button>)}</div> : q.trim() ? <div className="small muted" style={{ padding: 8 }}>Ningún Pokémon con ese nombre.</div> : null}
        </>
      )}
    </div>
  );
}
