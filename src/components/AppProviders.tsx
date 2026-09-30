'use client';
import type { Perfil } from '@/lib/coleccion';
import { PerfilProvider } from './PerfilProvider';
import { CatalogoProvider } from './CatalogoProvider';
import { ColeccionProvider } from './ColeccionProvider';
import { PreciosProvider } from './PreciosProvider';
import { MercadoProvider } from './MercadoProvider';

export function AppProviders({ perfil, children }: { perfil: Perfil; children: React.ReactNode }) {
  return (
    <PerfilProvider perfil={perfil}>
      <CatalogoProvider>
        <ColeccionProvider>
          <PreciosProvider><MercadoProvider>{children}</MercadoProvider></PreciosProvider>
        </ColeccionProvider>
      </CatalogoProvider>
    </PerfilProvider>
  );
}
