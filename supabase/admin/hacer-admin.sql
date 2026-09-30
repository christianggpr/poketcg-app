-- Convierte en administrador a la cuenta del correo indicado.
-- Requisito: esa cuenta ya debe estar registrada y verificada en la app.
-- Pegar en Supabase → SQL Editor → Run.
update public.perfiles
   set rol = 'admin'
 where lower(email) = lower('info@poketcg.pe');

select username, email, rol from public.perfiles where rol = 'admin';
