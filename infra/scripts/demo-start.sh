#!/usr/bin/env bash
# Starts the CODEK demo (API + worker + website) in the background and creates demo accounts.
# Development only. Logs: .demo/*.log   Accounts: .demo/ACCOUNTS.txt   Stop: bash infra/scripts/demo-start.sh stop
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p .demo

ROOT="$PWD"
# Each service runs in its own session (setsid), so stopping kills the whole process group.
stop() { for f in .demo/*.pid; do [ -f "$f" ] && kill -- "-$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done; }
stop
[ "${1:-}" = "stop" ] && { echo "[demo] stopped"; exit 0; }

[ -f .env ] && [ -f apps/api/dist/main.js ] && [ -d apps/web/.next ] || bash infra/scripts/demo-setup.sh
if [ "${DEMO_SKIP_DOCKER:-}" != "1" ]; then docker compose -f infra/docker-compose.yml up -d --wait; fi

if [ -n "${CODESPACE_NAME:-}" ]; then
  PUBLIC_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  PUBLIC_URL="${DEMO_PUBLIC_URL:-http://localhost:3000}"
fi
export APP_ENV=development NODE_ENV=production API_PORT=4000 AUTH_REQUIRE_EMAIL_VERIFICATION=false
export WEB_PUBLIC_URL="$PUBLIC_URL" TRACKING_PUBLIC_URL="$PUBLIC_URL" API_PUBLIC_URL="http://localhost:4000"
export CORS_ALLOWED_ORIGINS="$PUBLIC_URL,http://localhost:3000" API_INTERNAL_URL="http://localhost:4000"

start() { ( cd "$2"; exec setsid nohup $3 >"$ROOT/.demo/$1.log" 2>&1 </dev/null ) & echo $! >".demo/$1.pid"; }
wait_for() { for _ in $(seq 1 90); do curl -fs -o /dev/null "$1" && return 0; sleep 1; done; echo "[demo] $1 did not start; see .demo/*.log"; exit 1; }

start api apps/api "node dist/main.js"
wait_for http://localhost:4000/api/v1/health/live
start worker apps/worker "node dist/main.js"
start web apps/web "pnpm exec next start -p 3000"
wait_for http://localhost:3000

node infra/scripts/demo-accounts.mjs "$PUBLIC_URL"
echo
echo "[demo] CODEK is running: $PUBLIC_URL"
echo "[demo] demo sign-in details: .demo/ACCOUNTS.txt"
