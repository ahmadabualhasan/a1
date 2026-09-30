#!/usr/bin/env bash
# Post-deploy smoke test. Fails fast on the first broken check. Read-only: creates no data.
# Usage: WEB_URL=https://codek.example API_URL=https://api.codek.example [METRICS_TOKEN=…] infra/scripts/smoke-test.sh
set -euo pipefail
WEB_URL="${WEB_URL:?WEB_URL is required}"
API_URL="${API_URL:-$WEB_URL}"
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }
check() { echo "ok  - $*"; }

code=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/v1/health/live"); [ "$code" = 200 ] || fail "API liveness $code"; check "API liveness"
ready=$(curl -s "$API_URL/api/v1/health/ready"); echo "$ready" | grep -q '"status":"ok"' || fail "API readiness: $ready"; check "API readiness (database + redis)"
curl -s "$API_URL/api/v1/pricing" | grep -q '"data"' || fail "pricing endpoint"; check "public pricing"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/v1/auth/session"); [ "$code" = 401 ] || fail "anonymous session should be 401, got $code"; check "auth required on protected routes"
headers=$(curl -sI "$WEB_URL/")
echo "$headers" | grep -qi '^HTTP/[0-9.]* 200' || fail "web home not 200"; check "web home"
echo "$headers" | grep -qi 'content-security-policy:.*frame-ancestors' || fail "web CSP missing"; check "web CSP"
echo "$headers" | grep -qi 'x-frame-options: DENY' || fail "web X-Frame-Options missing"; check "web X-Frame-Options"
curl -s "$WEB_URL/api/v1/health/ready" | grep -q '"status":"ok"' || fail "web → API proxy"; check "web → API same-origin proxy"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/v1/metrics")
if [ -n "${METRICS_TOKEN:-}" ]; then
  [ "$code" = 401 ] || fail "metrics must require a token (got $code)"
  curl -s -H "Authorization: Bearer $METRICS_TOKEN" "$API_URL/api/v1/metrics" | grep -q codek_http_request_duration_seconds || fail "metrics with token"
  check "metrics protected by token"
fi
echo "SMOKE PASSED"
