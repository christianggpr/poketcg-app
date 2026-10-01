#!/bin/bash
# Reconstruye la app con el entorno de prueba y (re)inicia mock + servidor.
cd "$(dirname "$0")/.."
source test/env-prueba.sh
service postgresql status >/dev/null 2>&1 || service postgresql start >/dev/null 2>&1
for p in $(pgrep -f "next-serve[r]" ; pgrep -f "mock-supabas[e].mjs"); do kill $p 2>/dev/null; done
sleep 1
# APK de prueba (la portada ofrece la descarga cuando existe; en producción lo deja GitHub Actions)
if [ ! -f public/descargas/android.json ]; then
  mkdir -p public/descargas
  printf 'PK\003\004apk-de-prueba' > public/descargas/poketcg.apk
  echo '{"version":"1.0.0","codigo":1,"bytes":1234567,"sha256":"x","fecha":"2026-10-01","paquete":"pe.poketcg.app"}' > public/descargas/android.json
fi
npx next build > /tmp/build.log 2>&1 || { echo "BUILD FALLÓ"; tail -30 /tmp/build.log; exit 1; }
grep -E "Compiled" /tmp/build.log
(nohup env DATABASE_URL=postgresql://postgres:test@127.0.0.1:5432/poketcg_test node test/mock-supabase.mjs > /tmp/mock.log 2>&1 &)
(nohup npx next start -p 3000 > /tmp/next.log 2>&1 &)
sleep 5
curl -s -o /dev/null -w "app: %{http_code}\n" http://127.0.0.1:3000/
