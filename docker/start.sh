#!/bin/sh
# Production entrypoint: apply Prisma migrations (retrying while the database wakes up), then serve.
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
# Migrations should use a direct (non-pooled) connection; fall back to DATABASE_URL if not given.
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

cd /app/apps/server
attempt=0
until ./node_modules/.bin/prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 10 ]; then
    echo "Database not reachable after $attempt attempts, giving up." >&2
    exit 1
  fi
  echo "Migration failed (attempt $attempt), database may be waking up. Retrying in 3s..."
  sleep 3
done

exec node dist/index.js
