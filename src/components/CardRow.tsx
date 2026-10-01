'use client';
import { useRouter } from 'next/navigation';
import type { Carta } from '@/lib/catalogo';
import { nombreAlt, nombreCarta, nombreColeccion, numLabel, rarezaLabel, urlSimbolo } from '@/lib/catalogo';
import type { Entrada } from '@/lib/coleccion';
import { useCatalogo } from './CatalogoProvider';
import { usePerfil } from './PerfilProvider';
import { Thumb } from './Thumb';
import { Precio } from './Precio';
import { LocChip } from './Ubicacion';
import type { Ubicador } from '@/lib/coleccion';

export function SimboloSet({ setId }: { setId: string }) {
  const cat = useCatalogo();
  const s = cat.coleccion(setId);
  if (!s) return null;
  if (s.rg === 'ja') return <span className="pill jp">JP</span>;
  const u = urlSimbolo(s);
  // eslint-disable-next-line @next/next/no-img-element
  return u ? <img className="setsym" src={u} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : null;
}

/**
 * Fila de una carta del catálogo, con lo que tienes de ella (cantidad y ubicaciones).
 * `locCompleta` (ajustes de layout 2 · 1): la ubicación con todo el detalle (álbum/Bulk y posición "#n de N").
 */
export function CardRow({ carta, entradas, ubicador, onClick, extra, dim, locCompleta }: { carta: Carta; entradas?: Entrada[]; ubicador?: Ubicador; onClick?: () => void; extra?: React.ReactNode; dim?: boolean; locCompleta?: boolean }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const router = useRouter();
  const idioma = perfil.idioma_nombres;
  const set = cat.setOf(carta);
  const propias = entradas || [];
  const qty = propias.reduce((n, e) => n + e.cantidad, 0);
  const alt = nombreAlt(carta, idioma);
  const contenido = (
    <>
      <Thumb carta={carta} set={set} />
      <div className="card-main">
        <div className="card-name">{nombreCarta(carta, idioma)}{alt ? <span className="alt"> · {alt}</span> : null}{carta.sd ? <> <span className="badge-sd">sin datos</span></> : null}</div>
        <div className="card-set"><SimboloSet setId={carta.s} /> {nombreColeccion(set, idioma)} <span className="num">{numLabel(carta, set)}</span>{carta.r ? <span className="faint"> · {rarezaLabel(carta.r)}</span> : null}</div>
        {qty > 0 ? (
          <div className={`small ${locCompleta ? 'donde-la-tengo' : ''}`} style={{ marginTop: 3 }} data-testid={locCompleta ? 'donde-la-tengo' : undefined}>
            <span className="pill primary">×{qty}</span>{' '}
            {ubicador ? propias.slice(0, 3).map(e => <span key={e.id} style={{ marginRight: 6 }}><LocChip loc={ubicador.donde(e)} corto={!locCompleta} /></span>) : null}
            {propias.length > 3 ? <span className="faint">+{propias.length - 3}</span> : null}
          </div>
        ) : locCompleta ? <div className="small muted" style={{ marginTop: 3 }} data-testid="donde-la-tengo">Todavía no la tienes</div> : null}
        {extra}
      </div>
      <div className="card-side"><Precio carta={carta} acabado={propias[0]?.acabado || ''} /></div>
    </>
  );
  const cls = `card-row ${dim ? 'dim' : ''}`;
  const ir = onClick || (() => router.push(`/app/carta/${encodeURIComponent(carta.id)}`));
  return <div className={cls} role="button" tabIndex={0} onClick={ir} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) ir(); }}>{contenido}</div>;
}
