-- PokéTCG · Fase 2 · despertador de la tarea diaria con pg_cron + pg_net.
-- 1) Activa las extensiones pg_cron y pg_net (Database → Extensions).
-- 2) Reemplaza PON-AQUI-TU-CRON-SECRET por el valor de CRON_SECRET que pusiste en Vercel.
-- 3) Pega todo en Supabase → SQL Editor → Run. Se puede volver a ejecutar (reprograma).
--
-- Cada 10 minutos Supabase llama a https://poketcg.pe/api/tareas/tick. La app solo trabaja si hay
-- una tarea pendiente (la de las 00:00 de Lima); si no, responde al instante.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname = 'poketcg-tick' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'poketcg-tick',
  '*/10 * * * *',
  $$
    select net.http_post(
      url := 'https://poketcg.pe/api/tareas/tick',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer PON-AQUI-TU-CRON-SECRET"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 58000
    );
  $$
);

select jobid, jobname, schedule, active from cron.job where jobname = 'poketcg-tick';
