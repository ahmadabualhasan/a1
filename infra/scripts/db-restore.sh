#!/usr/bin/env bash
# Restore a CODEK backup into an EMPTY target database, verifying the checksum first.
#
# Usage: TARGET_DATABASE_URL=postgresql://…/codek_restore infra/scripts/db-restore.sh <file.dump>
# Env:   PG_TOOL_PREFIX  see db-backup.sh
# Refuses to restore into a database that already contains CODEK tables: restoring over live data is a destructive,
# manual decision (see docs/RECOVERY.md).
set -euo pipefail
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
FILE="${1:?backup file required}"
PREFIX="${PG_TOOL_PREFIX:-}"
URL="${TARGET_DATABASE_URL%%\?*}"

if [ -f "$FILE.sha256" ]; then
  expected=$(cat "$FILE.sha256")
  actual=$(sha256sum "$FILE" | awk '{print $1}')
  [ "$expected" = "$actual" ] || { echo "checksum mismatch for $FILE" >&2; exit 3; }
else
  echo "no checksum file next to $FILE; refusing to restore an unverified backup" >&2
  exit 3
fi

existing=$($PREFIX psql "$URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if [ "$existing" != "0" ]; then
  echo "target database is not empty ($existing tables); restore into a new database instead" >&2
  exit 4
fi

$PREFIX pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -d "$URL" < "$FILE"
echo "restored $FILE into $(basename "$URL")"
