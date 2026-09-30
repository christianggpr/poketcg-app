#!/bin/bash
# (Re)inicia solo el Supabase simulado.
cd "$(dirname "$0")/.."
service postgresql status >/dev/null 2>&1 || service postgresql start >/dev/null 2>&1
for p in $(pgrep -f "mock-supabas[e].mjs"); do kill $p 2>/dev/null; done
sleep 1
(nohup env DATABASE_URL=postgresql://postgres:test@127.0.0.1:5432/poketcg_test node test/mock-supabase.mjs > /tmp/mock.log 2>&1 &)
sleep 2
head -1 /tmp/mock.log
