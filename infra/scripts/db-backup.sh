#!/usr/bin/env bash
# Logical backup of the CODEK database (custom format, compressed) with a SHA-256 checksum.
#
# Usage: DATABASE_URL=postgresql://… infra/scripts/db-backup.sh [output-dir]
# Env:   PG_TOOL_PREFIX  optional command prefix to run the PostgreSQL client tools, e.g.
#                        "docker exec -i codek-pg" when the host has older client binaries.
# The dump contains personal and financial data: store it encrypted (e.g. S3 SSE-KMS), restrict access, and apply
# the retention policy in docs/RECOVERY.md. Never commit dumps.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT_DIR="${1:-./backups}"
PREFIX="${PG_TOOL_PREFIX:-}"
URL="${DATABASE_URL%%\?*}" # libpq does not understand Prisma's ?schema= parameter
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

server_major=$($PREFIX psql "$URL" -Atc 'SHOW server_version_num' | cut -c1-2)
client_major=$($PREFIX pg_dump --version | grep -oE '[0-9]+' | head -1)
if [ "$client_major" -lt "$server_major" ]; then
  echo "pg_dump $client_major cannot dump a PostgreSQL $server_major server; set PG_TOOL_PREFIX (see header)." >&2
  exit 2
fi

stamp=$(date -u +%Y%m%dT%H%M%SZ)
db=$(basename "$URL")
file="$OUT_DIR/codek-${db}-${stamp}.dump"
umask 077
$PREFIX pg_dump --format=custom --compress=6 --no-owner --no-privileges "$URL" > "$file"
sha256sum "$file" | awk '{print $1}' > "$file.sha256"
echo "backup: $file ($(du -h "$file" | cut -f1)), sha256 $(cat "$file.sha256")"
