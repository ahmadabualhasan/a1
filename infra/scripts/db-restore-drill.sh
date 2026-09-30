#!/usr/bin/env bash
# Backup → restore into a scratch database → compare integrity reports → drop the scratch database.
# Proves that backups are restorable and that financial/audit invariants survive the round trip.
#
# Usage: DATABASE_URL=postgresql://…/codek_e2e infra/scripts/db-restore-drill.sh
# Env:   PG_TOOL_PREFIX (see db-backup.sh). Only runs against databases named codek_e2e / codek_test / codek_ci /
#        codek_staging to avoid creating scratch databases next to production by accident.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PREFIX="${PG_TOOL_PREFIX:-}"
SRC="${DATABASE_URL%%\?*}"
db=$(basename "$SRC")
case "$db" in codek_e2e|codek_test|codek_ci|codek_staging) ;; *) echo "refusing to run the drill against '$db'" >&2; exit 2 ;; esac
scratch="${db}_restore_drill"
ADMIN="${SRC%/*}/postgres"
TARGET="${SRC%/*}/$scratch"
work=$(mktemp -d)
cleanup() { $PREFIX psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $scratch" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

"$HERE/db-backup.sh" "$work"
file=$(ls "$work"/*.dump)
$PREFIX psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $scratch" >/dev/null
$PREFIX psql "$ADMIN" -qc "CREATE DATABASE $scratch" >/dev/null
TARGET_DATABASE_URL="$TARGET" "$HERE/db-restore.sh" "$file"

$PREFIX psql -q "$SRC" -v ON_ERROR_STOP=1 -f - < "$HERE/db-verify.sql" > "$work/source.txt"
$PREFIX psql -q "$TARGET" -v ON_ERROR_STOP=1 -f - < "$HERE/db-verify.sql" > "$work/restored.txt"
if ! diff -u "$work/source.txt" "$work/restored.txt"; then
  echo "restore drill FAILED: integrity reports differ" >&2
  exit 1
fi
grep -q '^ledger_unbalanced_entries=0$' "$work/restored.txt" || { echo "restore drill FAILED: unbalanced ledger entries" >&2; exit 1; }
grep -q '^audit_chain_first_broken_seq=none$' "$work/restored.txt" || { echo "restore drill FAILED: audit chain broken" >&2; exit 1; }
echo "restore drill PASSED"
cat "$work/restored.txt"
