#!/usr/bin/env bash
# Rollback-safety gate (docs/DEPLOYMENT.md "Migrations and rollback"): migrations must be expand-only so the previous
# application version keeps working on the new schema. Destructive statements are rejected unless the migration
# carries an explicit, reviewed marker line:  -- codek:allow-destructive <reason / release it contracts>
set -euo pipefail
cd "$(dirname "$0")/../../database/prisma/migrations"
pattern='DROP[[:space:]]+(TABLE|COLUMN|TYPE|SCHEMA|INDEX)|RENAME[[:space:]]+(TO|COLUMN)|ALTER[[:space:]]+COLUMN[^;]*[[:space:]]TYPE[[:space:]]|ALTER[[:space:]]+COLUMN[^;]*SET[[:space:]]+NOT[[:space:]]+NULL|^[[:space:]]*TRUNCATE[[:space:]]'
fail=0
for f in */migration.sql; do
  if grep -qiE "^-- codek:allow-destructive [^[:space:]]" "$f"; then continue; fi
  if hits=$(grep -niE "$pattern" "$f" | grep -viE '^[0-9]+:[[:space:]]*--'); then
    echo "Destructive statement in $f (add '-- codek:allow-destructive <reason>' only for a planned contract step):"
    echo "$hits" | sed 's/^/  /'
    fail=1
  fi
done
[ "$fail" = 0 ] && echo "migrations: expand-only check passed ($(ls -d */ | wc -l) migrations)"
exit "$fail"
