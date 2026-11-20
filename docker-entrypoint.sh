#!/bin/sh
# Runs on every container start: tables -> safety constraints -> (first run only) demo data -> server.
set -e
echo "[lumera] preparing database…"
npx prisma db push --skip-generate
npx prisma db execute --file prisma/manual/0001_integrity_constraints.sql --schema prisma/schema.prisma
if [ "$SEED_DEMO" = "true" ]; then
  # the seed refuses to touch a non-empty database, so this is safe to leave on; set SEED_DEMO=false once you have real data
  npm run db:seed || echo "[lumera] seed skipped (database already has data)"
fi
echo "[lumera] starting…"
exec npm run start
