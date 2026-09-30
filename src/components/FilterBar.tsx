'use client';
import { SORT_LABELS, TYPE_ES, TYPE_ICON, TYPE_ORDER, type ModoOrden } from '@/lib/catalogo';

export type Filtro = { sort: ModoOrden; type: string; lang: string };

export function FilterBar({ f, onChange, sorts, langs, extra }: { f: Filtro; onChange: (f: Filtro) => void; sorts?: ModoOrden[]; langs?: string[]; extra?: React.ReactNode }) {
  const lista = sorts || (['recent', 'name', 'type', 'value', 'dex', 'set'] as ModoOrden[]);
  const types = ['', ...TYPE_ORDER, 'Trainer', 'Energy'];
  return (
    <div className="filterbar">
      <div className="row wrap" style={{ gap: 6 }}>
        <label className="small muted">Ordenar</label>
        <select className="input sm" value={f.sort} onChange={e => onChange({ ...f, sort: e.target.value as ModoOrden })}>
          {lista.map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
        </select>
        {langs && langs.length ? (
          <select className="input sm" value={f.lang} onChange={e => onChange({ ...f, lang: e.target.value })}>
            <option value="">Todos los idiomas</option>
            {langs.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        ) : null}
        {extra}
      </div>
      <div className="chips typechips" style={{ marginTop: 6 }}>
        {types.map(t => (
          <button key={t} className={`chipbtn ${(f.type || '') === t ? 'active' : ''}`} onClick={() => onChange({ ...f, type: t })} title={t ? TYPE_ES[t] : 'Todos los tipos'}>
            {t ? TYPE_ICON[t] + (t === 'Trainer' || t === 'Energy' ? ' ' + TYPE_ES[t] : '') : 'Todos'}
          </button>
        ))}
      </div>
    </div>
  );
}
