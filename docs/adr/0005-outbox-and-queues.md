# ADR-0005: Transactional outbox + BullMQ, with sweepers as the safety net

- Status: Accepted
- Date: 2026-09-29

## Context
Side effects (notifications, fraud signals, webhook processing, payouts) must never be lost when Redis or a worker is
down, and must never be applied twice.

## Decision
- Domain events are written to `outbox_events` in the same transaction as the state change. A dispatcher claims rows
  with `FOR UPDATE SKIP LOCKED` and a lease (`next_attempt_at`), runs idempotent handlers, and retries with backoff.
- Inbound webhooks are stored raw (immutable) before acknowledgement, then queued. Payout attempts are append-only.
- BullMQ provides low-latency processing; per-minute sweepers re-queue anything stuck (events received while Redis was
  down, events left `processing` by a crashed worker, payouts awaiting provider status, expired outbox leases).
- Every handler is idempotent (unique keys, per-order advisory locks, dedupe keys).

## Consequences
- At-least-once delivery with exactly-once effects; covered by `apps/api/test/recovery.test.ts` and the load test.
