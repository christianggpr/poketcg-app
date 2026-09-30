import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { generarExcelRetiros } from '@/lib/retiros';

export const runtime = 'nodejs';

/** Descarga el Excel de pagos pendientes (el mismo que se envía por correo cada día de pago). */
export async function GET() {
  if (!(await esAdminActual())) return new Response('Solo el administrador.', { status: 403 });
  try {
    const { buffer, nombre } = await generarExcelRetiros(supabaseAdmin());
    return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nombre}"` } });
  } catch (e) { return new Response((e as Error).message, { status: 500 }); }
}
