#!/usr/bin/env bash
# One-time setup of a LOCAL DEMO environment (GitHub Codespaces or any dev machine with Docker).
# Development only: sandbox payouts, logged emails, local storage. Never use for staging/production.
set -euo pipefail
cd "$(dirname "$0")/../.."

corepack enable >/dev/null 2>&1 || true
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@10.33.0
pnpm install --frozen-lockfile

if [ ! -f .env ]; then
  node -e "
    const c=require('crypto'),fs=require('fs');
    let e=fs.readFileSync('.env.example','utf8');
    e=e.replace(/^AUTH_SECRET=.*/m,'AUTH_SECRET='+c.randomBytes(32).toString('hex'))
       .replace(/^HASH_PEPPER=.*/m,'HASH_PEPPER='+c.randomBytes(16).toString('hex'))
       .replace(/^SECRETS_MASTER_KEY=.*/m,'SECRETS_MASTER_KEY='+c.randomBytes(32).toString('base64'));
    fs.writeFileSync('.env',e);"
  echo "[demo] created .env with random local secrets"
fi

if [ "${DEMO_SKIP_DOCKER:-}" != "1" ]; then docker compose -f infra/docker-compose.yml up -d --wait; fi
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm build
echo "[demo] setup complete"
