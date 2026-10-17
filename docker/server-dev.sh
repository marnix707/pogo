#!/bin/sh
# Dev entrypoint for the server: wait for Postgres, apply migrations, then run in watch mode.
set -eu

export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
cd /app/apps/server

echo "Waiting for database and applying migrations..."
attempt=0
until pnpm exec prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Database not ready after $attempt attempts, giving up." >&2
    exit 1
  fi
  echo "Database not ready yet (attempt $attempt), retrying in 2s..."
  sleep 2
done

exec pnpm dev
