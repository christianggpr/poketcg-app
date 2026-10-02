'use client';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { quisisteDecir, sugerencias, textoSugerencia, type Correccion, type Sugerencia } from '@/lib/buscar';
import { useCatalogoOpcional } from './CatalogoProvider';
import { usePerfil } from './PerfilProvider';
import { Icono } from './Icono';

// Mejoras 4 · D: buscador con sugerencias mientras se escribe (nombre en ES/EN/JP, colección, ilustrador) y
// "¿Quisiste decir…?" cuando una palabra parece mal escrita. Funciona con el catálogo ya descargado (sin pg_trgm).

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Enter o toque en una sugerencia de carta (texto a buscar). */
  onBuscar: (texto: string) => void;
  /** Toque en una sugerencia de colección o ilustrador (si no se da, se busca el texto). */
  onElegir?: (s: Sugerencia) => void;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
  /** Botón a la derecha (cámara). */
  derecha?: ReactNode;
  testid?: string;
  inputTestid?: string;
  autoFocus?: boolean;
  grande?: boolean;
  limpiar?: boolean;
};

export function Buscador({ value, onChange, onBuscar, onElegir, placeholder, className = '', derecha, testid, inputTestid, autoFocus, limpiar, ...resto }: Props) {
  const { cat } = useCatalogoOpcional();
  const { perfil } = usePerfil();
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [lenta, setLenta] = useState(value);
  const ref = useRef<HTMLFormElement>(null);
  const idLista = useId();
  useEffect(() => { const t = setTimeout(() => setLenta(value), 90); return () => clearTimeout(t); }, [value]);
  const lista = useMemo(() => (cat && lenta.trim().length >= 2 ? sugerencias(cat, lenta, 8) : []), [cat, lenta]);
  useEffect(() => { setActiva(-1); }, [lista]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); };
  }, [abierto]);
  const elegir = (s: Sugerencia) => {
    setAbierto(false);
    if (s.tipo === 'carta' || !onElegir) { onChange(s.texto); onBuscar(s.texto); } else onElegir(s);
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (abierto && activa >= 0 && lista[activa]) { elegir(lista[activa]); return; }
    setAbierto(false);
    onBuscar(value.trim());
  };
  const mostrar = abierto && lista.length > 0;
  return (
    <form className={`buscador ${className}`} role="search" onSubmit={enviar} ref={ref} data-testid={testid}>
      <span className="ico"><Icono n="buscar" tam={20} /></span>
      <input className="input" type="search" value={value} placeholder={placeholder} aria-label={resto['aria-label'] || placeholder} autoFocus={autoFocus}
        role="combobox" aria-expanded={mostrar} aria-controls={idLista} aria-autocomplete="list" aria-activedescendant={mostrar && activa >= 0 ? `${idLista}-${activa}` : undefined} autoComplete="off"
        onChange={e => { onChange(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)}
        onKeyDown={e => {
          if (!mostrar) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActiva(a => (a + 1) % lista.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiva(a => (a <= 0 ? lista.length - 1 : a - 1)); }
          else if (e.key === 'Escape') { setAbierto(false); }
        }}
        data-testid={inputTestid} />
      {limpiar && value ? <button type="button" className="clear" onClick={() => { onChange(''); onBuscar(''); }} aria-label="Borrar"><Icono n="cerrar" /></button> : null}
      {derecha}
      {mostrar ? (
        <ul className="sugerencias" role="listbox" id={idLista} data-testid="sugerencias">
          {lista.map((s, i) => (
            <li key={s.tipo + s.texto} id={`${idLista}-${i}`} role="option" aria-selected={i === activa} className={i === activa ? 'activa' : ''} onMouseDown={e => e.preventDefault()} onClick={() => elegir(s)} data-testid={`sugerencia-${s.tipo}`}>
              <Icono n={s.tipo === 'coleccion' ? 'album' : s.tipo === 'ilustrador' ? 'lapiz' : 'buscar'} tam={16} />
              <span className="texto">{cat ? textoSugerencia(s, cat, perfil.idioma_nombres) : s.texto}</span>
              <span className="detalle">{s.tipo === 'coleccion' ? 'colección' : s.tipo === 'ilustrador' ? 'ilustrador' : `${s.cartas} ${s.cartas === 1 ? 'carta' : 'cartas'}`}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

/** "¿Quisiste decir Charizard?" cuando una palabra de la consulta parece mal escrita. */
export function QuisisteDecir({ q, onElegir, className = '' }: { q: string; onElegir: (c: Correccion) => void; className?: string }) {
  const { cat } = useCatalogoOpcional();
  const c = useMemo(() => (cat && q.trim() ? quisisteDecir(cat, q) : null), [cat, q]);
  if (!c) return null;
  return <p className={`quisiste-decir ${className}`} data-testid="quisiste-decir">¿Quisiste decir <button type="button" className="link" onClick={() => onElegir(c)} data-testid="btn-quisiste-decir">{c.consulta}</button>?</p>;
}
