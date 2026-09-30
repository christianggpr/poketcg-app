'use client';
import { useEffect } from 'react';

/** Registra el service worker (caché de la app e imágenes; aviso sin conexión). */
export function RegistrarSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
