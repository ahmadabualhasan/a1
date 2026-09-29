import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, TransactionClient } from '@codek/database';
import { assertBalanced, normalBalance, ownerTypeOf, type AccountRef, type AccountType, type Posting } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';

export interface PostingMeta {
  businessId?: string | null;
  referenceType?: string;
  referenceId?: string;
  /** Required: guarantees a retried operation never produces a second financial effect. */
  idempotencyKey: string;
  description?: string;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

export type Db = TransactionClient | PrismaClient;

/**
 * Double-entry ledger (spec §9). The only code path that writes ledger_entries / ledger_entry_lines.
 * Entries are validated in the domain layer, re-validated by deferred DB constraint triggers at COMMIT,
 * and deduplicated by idempotency key (ON CONFLICT DO NOTHING — never aborts the surrounding transaction).
 */
@Injectable()
export class LedgerService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async account(tx: Db, ref: AccountRef): Promise<string> {
    const ownerType = ownerTypeOf(ref.accountType);
    const ownerKey = ref.ownerId ?? 'platform';
    const id = randomUUID();
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ledger_accounts (id, business_id, owner_type, owner_id, owner_key, account_type, currency, status, created_at)
      VALUES (${id}::uuid, ${ownerType === 'business' ? ref.ownerId : null}::uuid, ${ownerType}::"LedgerOwnerType", ${ref.ownerId}::uuid, ${ownerKey},
              ${ref.accountType}, ${ref.currency}, 'active', now())
      ON CONFLICT (owner_type, owner_key, account_type, currency) DO UPDATE SET status = ledger_accounts.status
      RETURNING id`;
    return rows[0]!.id;
  }

  /** Post a balanced entry. Returns the entry id and whether it was newly created (false = idempotent replay). */
  async post(tx: Db, posting: Posting, meta: PostingMeta): Promise<{ entryId: string; created: boolean }> {
    assertBalanced(posting);
    const entryId = randomUUID();
    const metadata = JSON.stringify(meta.metadata ?? {});
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ledger_entries (id, business_id, entry_type, reference_type, reference_id, idempotency_key, currency, effective_at, created_at, created_by, description, metadata)
      VALUES (${entryId}::uuid, ${meta.businessId ?? null}::uuid, ${posting.entryType}, ${meta.referenceType ?? null}, ${meta.referenceId ?? null}::uuid,
              ${meta.idempotencyKey}, ${posting.currency}, now(), now(), ${meta.createdBy ?? null}::uuid, ${meta.description ?? null}, ${metadata}::jsonb)
      ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`;
    if (!inserted.length) {
      const existing = await tx.ledgerEntry.findUniqueOrThrow({ where: { idempotencyKey: meta.idempotencyKey } });
      return { entryId: existing.id, created: false };
    }
    let order = 1;
    for (const line of posting.lines) {
      const accountId = await this.account(tx, line.account);
      await tx.ledgerEntryLine.create({
        data: { ledgerEntryId: entryId, ledgerAccountId: accountId, direction: line.direction, amountMinor: line.amountMinor, currency: posting.currency, lineOrder: order++ },
      });
    }
    return { entryId, created: true };
  }

  /** Normal-direction balance of one account (0 when the account does not exist yet). */
  async balance(db: Db, ref: AccountRef): Promise<bigint> {
    const ownerKey = ref.ownerId ?? 'platform';
    const rows = await db.$queryRaw<Array<{ debits: bigint | null; credits: bigint | null }>>`
      SELECT coalesce(sum(l.amount_minor) FILTER (WHERE l.direction = 'debit'), 0)::bigint AS debits,
             coalesce(sum(l.amount_minor) FILTER (WHERE l.direction = 'credit'), 0)::bigint AS credits
        FROM ledger_accounts a LEFT JOIN ledger_entry_lines l ON l.ledger_account_id = a.id
       WHERE a.owner_type = ${ownerTypeOf(ref.accountType)}::"LedgerOwnerType" AND a.owner_key = ${ownerKey}
         AND a.account_type = ${ref.accountType} AND a.currency = ${ref.currency}`;
    const r = rows[0];
    return normalBalance(ref.accountType, BigInt(r?.debits ?? 0), BigInt(r?.credits ?? 0));
  }

  /** All balances for an owner, grouped by account type and currency (normal direction). */
  async ownerBalances(db: Db, ownerType: 'business' | 'creator' | 'platform', ownerId: string | null) {
    const rows = await db.$queryRaw<Array<{ account_type: string; currency: string; debits: bigint; credits: bigint }>>`
      SELECT a.account_type, a.currency,
             coalesce(sum(l.amount_minor) FILTER (WHERE l.direction = 'debit'), 0)::bigint AS debits,
             coalesce(sum(l.amount_minor) FILTER (WHERE l.direction = 'credit'), 0)::bigint AS credits
        FROM ledger_accounts a LEFT JOIN ledger_entry_lines l ON l.ledger_account_id = a.id
       WHERE a.owner_type = ${ownerType}::"LedgerOwnerType" AND a.owner_key = ${ownerId ?? 'platform'}
       GROUP BY a.account_type, a.currency ORDER BY a.currency, a.account_type`;
    return rows.map((r) => ({
      accountType: r.account_type as AccountType,
      currency: r.currency,
      balanceMinor: normalBalance(r.account_type as AccountType, BigInt(r.debits), BigInt(r.credits)),
    }));
  }

  /** Global invariant check (monitoring): every entry balanced and total debits = total credits per currency. */
  async verifyInvariants(db: Db = this.prisma): Promise<{ ok: boolean; unbalancedEntries: number; currencyImbalances: Array<{ currency: string; diff: bigint }> }> {
    const unbalanced = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM (
        SELECT ledger_entry_id FROM ledger_entry_lines GROUP BY ledger_entry_id
        HAVING sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END) <> 0 OR count(*) < 2) x`;
    const byCurrency = await db.$queryRaw<Array<{ currency: string; diff: bigint }>>`
      SELECT currency, sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END)::bigint AS diff
        FROM ledger_entry_lines GROUP BY currency HAVING sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END) <> 0`;
    const n = Number(unbalanced[0]?.n ?? 0);
    return { ok: n === 0 && byCurrency.length === 0, unbalancedEntries: n, currencyImbalances: byCurrency.map((r) => ({ currency: r.currency, diff: BigInt(r.diff) })) };
  }

  async entriesFor(db: Db, referenceType: string, referenceId: string) {
    return db.ledgerEntry.findMany({ where: { referenceType, referenceId }, include: { lines: { include: { account: true }, orderBy: { lineOrder: 'asc' } } }, orderBy: { createdAt: 'asc' } });
  }
}
