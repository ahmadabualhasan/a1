# Analytics metric definitions (analytics-v1)

All analytics responses include `provenance` (source, `metricDefinitionVersion`, attribution model, computedAt,
range). No customer PII is returned by analytics endpoints or exports.

| Metric | Definition |
|---|---|
| Clicks | Referral redirects/SDK clicks for the business in range, excluding clicks flagged as bots (`suspected`). |
| Tracked visits | New tracking sessions (first touch) in range. |
| Conversions | Conversion records by `occurred_at`, broken down by verified / self-reported / unknown and by status. |
| Attribution states | Current attribution decision per conversion: attributed, unattributed, conflicted, invalid, duplicate. |
| Total (verified) sales | Σ(gross − discount) of **verified** conversions not rejected/cancelled/reversed, per currency. Self-reported amounts are never included. Refunds are reported separately (`refundedMinor`). |
| Creator-attributed sales | The subset of verified sales with an attributed partnership. |
| Creator commissions | Σ(commission − reversed − clawed back) from commission records for conversions in range. |
| CODEK fees | Σ(fee − fee reversed). 0 on the default plan (D-003). |
| Conversion rate | Attributed conversions ÷ clicks (null when there are no clicks). |
| Impressions | Not available from connected platforms (reported as null). |
| Ledger check | Outstanding (pending + approved) commission+fee obligations from commission records must equal the business's `merchant_receivable` ledger balance; `consistent=false` indicates a reconciliation issue. |

Daily aggregates (`analytics_daily_stats`) are refreshed hourly by the worker for today and yesterday (late events are
folded in). CSV exports are UTF-8 with BOM, CRLF, and formula-injection guarded.
