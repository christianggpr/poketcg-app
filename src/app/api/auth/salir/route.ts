import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { origenDe } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', origenDe(req)), { status: 303 });
}
