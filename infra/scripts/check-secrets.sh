#!/usr/bin/env bash
# Fails if tracked files contain obvious secret material. Complements GitHub secret scanning.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0
if git ls-files | grep -E '(^|/)\.env$|(^|/)\.env\.(local|production|staging)$' ; then
  echo "ERROR: .env files must not be committed"; fail=1
fi
patterns='(AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|sk_live_[0-9a-zA-Z]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|ghp_[0-9A-Za-z]{30,}|shpat_[0-9a-fA-F]{32})'
if git ls-files -z | xargs -0 grep -EIl "$patterns" -- 2>/dev/null | grep -v 'check-secrets.sh'; then
  echo "ERROR: potential secret material found in tracked files"; fail=1
fi
[ $fail -eq 0 ] && echo "secret scan: clean"
exit $fail
