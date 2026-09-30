#!/bin/bash
# Crea (o recrea) la base local de pruebas `poketcg_test` con la emulación mínima de Supabase
# (auth, storage, roles) y aplica todas las migraciones de supabase/migrations en orden.
#   test/db/reiniciar.sh            → recrea desde cero
#   test/db/reiniciar.sh --solo-migraciones → solo vuelve a aplicar las migraciones (son idempotentes)
cd "$(dirname "$0")/../.."
service postgresql status >/dev/null 2>&1 || service postgresql start >/dev/null 2>&1
export PGPASSWORD=test
PSQL="psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -q"
if [ "$1" != "--solo-migraciones" ]; then
  $PSQL -d postgres -c "drop database if exists poketcg_test" -c "create database poketcg_test" || exit 1
  $PSQL -d poketcg_test -f test/db/supabase-stub.sql || exit 1
fi
for f in supabase/migrations/*.sql; do
  echo "aplicando $f"
  $PSQL -d poketcg_test -f "$f" || exit 1
done
echo "base de pruebas lista"
