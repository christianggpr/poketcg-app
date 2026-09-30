'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Tipo = '' | 'ok' | 'danger';
type Aviso = { id: number; texto: string; tipo: Tipo };
type Ctx = { toast: (texto: string, tipo?: Tipo, ms?: number) => void };

const ToastCtx = createContext<Ctx>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const n = useRef(0);
  const toast = useCallback((texto: string, tipo: Tipo = '', ms = 2600) => {
    const id = ++n.current;
    setAvisos(a => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos(a => a.filter(x => x.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toast-root" aria-live="polite">
        {avisos.map(a => (
          <div key={a.id} className={`toast ${a.tipo}`}>{a.texto}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx).toast;
