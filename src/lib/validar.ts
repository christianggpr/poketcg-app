// Validación de los datos de registro y perfil. Se usa en el navegador (para avisar al instante)
// y en el servidor (la que manda). Mensajes en español.

export const RE_USERNAME = /^[A-Za-z0-9_]{3,20}$/;
export const RE_EMAIL = /^[^\s@,()<>"']+@[^\s@,()<>"']+\.[^\s@,()<>"']{2,}$/;
export const RE_TELEFONO = /^9[0-9]{8}$/;
export const RE_DNI = /^[0-9]{8}$/;

export type DatosRegistro = {
  nombres: string;
  apellidos: string;
  username: string;
  email: string;
  telefono: string;
  dni: string;
  password: string;
  aceptaTerminos: boolean;
};

export type Errores = Partial<Record<keyof DatosRegistro, string>>;

function limpiar(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

export function normalizarRegistro(entrada: Partial<DatosRegistro> | Record<string, unknown>): DatosRegistro {
  const e = entrada as Record<string, unknown>;
  return {
    nombres: limpiar(e.nombres).replace(/\s+/g, ' '),
    apellidos: limpiar(e.apellidos).replace(/\s+/g, ' '),
    username: limpiar(e.username),
    email: limpiar(e.email).toLowerCase(),
    telefono: limpiar(e.telefono).replace(/[\s-]/g, ''),
    dni: limpiar(e.dni),
    password: typeof e.password === 'string' ? e.password : '',
    aceptaTerminos: e.aceptaTerminos === true || e.aceptaTerminos === 'true' || e.aceptaTerminos === 'on'
  };
}

export function validarRegistro(entrada: Partial<DatosRegistro> | Record<string, unknown>): { ok: true; datos: DatosRegistro } | { ok: false; errores: Errores } {
  const d = normalizarRegistro(entrada);
  const errores: Errores = {};
  if (d.nombres.length < 2 || d.nombres.length > 60) errores.nombres = 'Escribe tus nombres (2 a 60 letras).';
  if (d.apellidos.length < 2 || d.apellidos.length > 60) errores.apellidos = 'Escribe tus apellidos (2 a 60 letras).';
  if (!RE_USERNAME.test(d.username)) errores.username = 'De 3 a 20 caracteres: letras, números o guion bajo, sin espacios.';
  if (!RE_EMAIL.test(d.email) || d.email.length > 120) errores.email = 'Escribe un correo válido.';
  if (!RE_TELEFONO.test(d.telefono)) errores.telefono = 'Celular peruano de 9 dígitos que empiece con 9.';
  if (!RE_DNI.test(d.dni)) errores.dni = 'El DNI tiene 8 dígitos.';
  if (d.password.length < 8) errores.password = 'La contraseña debe tener al menos 8 caracteres.';
  else if (d.password.length > 72) errores.password = 'La contraseña es demasiado larga (máximo 72).';
  if (!d.aceptaTerminos) errores.aceptaTerminos = 'Debes aceptar los términos y la política de privacidad.';
  if (Object.keys(errores).length) return { ok: false, errores };
  return { ok: true, datos: d };
}

export type DatosPerfil = { nombres: string; apellidos: string; username: string; telefono: string; idioma_nombres: 'es' | 'en' | 'ja' };

export function validarPerfil(entrada: Record<string, unknown>): { ok: true; datos: DatosPerfil } | { ok: false; errores: Partial<Record<keyof DatosPerfil, string>> } {
  const d: DatosPerfil = {
    nombres: limpiar(entrada.nombres).replace(/\s+/g, ' '),
    apellidos: limpiar(entrada.apellidos).replace(/\s+/g, ' '),
    username: limpiar(entrada.username),
    telefono: limpiar(entrada.telefono).replace(/[\s-]/g, ''),
    idioma_nombres: entrada.idioma_nombres === 'en' || entrada.idioma_nombres === 'ja' ? entrada.idioma_nombres : 'es'
  };
  const errores: Partial<Record<keyof DatosPerfil, string>> = {};
  if (d.nombres.length < 2 || d.nombres.length > 60) errores.nombres = 'Escribe tus nombres (2 a 60 letras).';
  if (d.apellidos.length < 2 || d.apellidos.length > 60) errores.apellidos = 'Escribe tus apellidos (2 a 60 letras).';
  if (!RE_USERNAME.test(d.username)) errores.username = 'De 3 a 20 caracteres: letras, números o guion bajo.';
  if (d.telefono && !RE_TELEFONO.test(d.telefono)) errores.telefono = 'Celular peruano de 9 dígitos que empiece con 9.';
  if (Object.keys(errores).length) return { ok: false, errores };
  return { ok: true, datos: d };
}

/** Oculta un DNI para mostrarlo: 12345678 → ••••5678 */
export function ocultarDni(dni: string | null | undefined): string {
  if (!dni) return '—';
  return '••••' + dni.slice(-4);
}
