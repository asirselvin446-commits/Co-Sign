#!/bin/sh
set -e
# Apply committed migrations before starting. Safe to run on every boot (no-op when up to date).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node ./node_modules/prisma/build/index.js migrate deploy
fi
exec node dist/src/index.js
