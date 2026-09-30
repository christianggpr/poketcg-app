import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTEGIDAS = ['/app', '/admin', '/cuenta'];
const SOLO_INVITADOS = ['/ingresar', '/registro', '/recuperar'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  // Renueva la sesión si hace falta (no usar getSession aquí: getUser valida el token con Supabase).
  const { data: { user } } = await supabase.auth.getUser();
  const ruta = request.nextUrl.pathname;

  if (!user && PROTEGIDAS.some(p => ruta === p || ruta.startsWith(p + '/'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/ingresar';
    url.searchParams.set('volver', ruta);
    return NextResponse.redirect(url);
  }
  if (user && SOLO_INVITADOS.some(p => ruta === p)) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|data/|manifest.webmanifest|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt)$).*)']
};
