// Envío de correos con Resend (API HTTP, sin dependencias). Solo en el servidor.
import { APP_NAME, EMAIL_FROM, ADMIN_EMAIL } from './config';

type Correo = { para: string; asunto: string; html: string; texto: string; adjuntos?: { filename: string; content: string }[] };

export async function enviarCorreo(c: Correo): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'Falta configurar RESEND_API_KEY en el servidor.' };
  try {
    const r = await fetch(process.env.RESEND_ENDPOINT || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [c.para], reply_to: ADMIN_EMAIL, subject: c.asunto, html: c.html, text: c.texto, ...(c.adjuntos?.length ? { attachments: c.adjuntos } : {}) })
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!r.ok) return { ok: false, error: j.message || j.name || `Resend respondió ${r.status}` };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

function plantilla(titulo: string, parrafos: string[], boton: { texto: string; url: string }, pie: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f3f5fa;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16203a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5fa;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(20,30,70,.10)">
      <tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:800">${esc(APP_NAME)}</td></tr>
      <tr><td style="padding:0 28px;font-size:18px;font-weight:700">${esc(titulo)}</td></tr>
      ${parrafos.map(p => `<tr><td style="padding:10px 28px 0;font-size:15px;line-height:1.5;color:#3a4460">${p}</td></tr>`).join('')}
      <tr><td style="padding:22px 28px"><a href="${esc(boton.url)}" style="display:inline-block;background:#2b4fc9;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:9px">${esc(boton.texto)}</a></td></tr>
      <tr><td style="padding:0 28px 8px;font-size:12px;color:#8b95b1;word-break:break-all">Si el botón no funciona, copia este enlace en tu navegador:<br>${esc(boton.url)}</td></tr>
      <tr><td style="padding:16px 28px 28px;font-size:12px;color:#8b95b1;border-top:1px solid #e9edf5">${esc(pie)}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export function correoVerificacion(nombre: string, url: string): Omit<Correo, 'para'> {
  const saludo = nombre ? `Hola, ${esc(nombre)}:` : 'Hola:';
  return {
    asunto: `Confirma tu correo en ${APP_NAME}`,
    html: plantilla('Confirma tu correo', [saludo, `Gracias por crear tu cuenta en ${esc(APP_NAME)}. Pulsa el botón para confirmar tu correo y empezar a registrar tu colección.`], { texto: 'Confirmar mi correo', url }, 'Si no creaste esta cuenta, ignora este mensaje.'),
    texto: `${nombre ? 'Hola, ' + nombre + ':' : 'Hola:'}\n\nConfirma tu correo en ${APP_NAME} abriendo este enlace:\n${url}\n\nSi no creaste esta cuenta, ignora este mensaje.`
  };
}

export function correoRecuperacion(nombre: string, url: string): Omit<Correo, 'para'> {
  const saludo = nombre ? `Hola, ${esc(nombre)}:` : 'Hola:';
  return {
    asunto: `Cambia tu contraseña de ${APP_NAME}`,
    html: plantilla('Cambiar contraseña', [saludo, `Recibimos un pedido para cambiar la contraseña de tu cuenta en ${esc(APP_NAME)}. Pulsa el botón y elige una nueva. El enlace vence en 1 hora.`], { texto: 'Elegir nueva contraseña', url }, 'Si no pediste este cambio, ignora este mensaje: tu contraseña seguirá igual.'),
    texto: `${nombre ? 'Hola, ' + nombre + ':' : 'Hola:'}\n\nPara cambiar tu contraseña de ${APP_NAME} abre este enlace (vence en 1 hora):\n${url}\n\nSi no pediste este cambio, ignora este mensaje.`
  };
}

/** Correo genérico de una notificación de la app (compras, ventas, pagos, retiros). */
export function correoNotificacion(nombre: string, titulo: string, cuerpo: string, url: string): Omit<Correo, 'para'> {
  const saludo = nombre ? `Hola, ${esc(nombre)}:` : 'Hola:';
  return {
    asunto: `${titulo} · ${APP_NAME}`,
    html: plantilla(titulo, [saludo, esc(cuerpo)], { texto: 'Ver en la app', url }, `Este aviso también está en tu bandeja de notificaciones de ${APP_NAME}.`),
    texto: `${nombre ? 'Hola, ' + nombre + ':' : 'Hola:'}\n\n${titulo}\n${cuerpo}\n\nVer en la app: ${url}`
  };
}
