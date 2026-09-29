import { Inject, Injectable } from '@nestjs/common';
import type { MerchantFunding, PrismaClient, TransactionClient } from '@codek/database';
import { assertSupportedCurrency, assertTransition, FundingMachine, Postings, type FundingStatus } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import type { Principal } from '../../auth/principal';
import { CommissionService } from '../finance/commission.service';
import { LedgerService } from '../finance/ledger.service';
import { FUNDING_PROVIDERS } from '../../payments/payments.module';
import type { FundingProvider } from '../../payments/provider.types';

export const FUNDING_METHODS = ['bank_transfer', 'sandbox'] as const;

/**
 * Merchant funding (spec §10.1, §10.4): the business funds its commission/fee obligations. Funding is recorded
 * through a provider workflow; balances are ledger-derived. CODEK does not claim escrow/custody (spec §10.3).
 */
@Injectable()
export class FundingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(FUNDING_PROVIDERS) private readonly providers: FundingProvider[],
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly ledger: LedgerService,
    private readonly commissions: CommissionService,
  ) {}

  async create(p: Principal, businessId: string, dto: { amountMinor: number; currency: string; fundingMethod: string; providerReference?: string }, idempotencyKey: string) {
    this.access.businessAccess(p, businessId, 'funding.manage');
    assertSupportedCurrency(dto.currency);
    const provider = this.providers.find((pr) => pr.methods.includes(dto.fundingMethod));
    if (dto.fundingMethod !== 'bank_transfer' && !provider) throw ruleViolation('This funding method is not available', { fundingMethod: dto.fundingMethod });
    const funding = await this.prisma.merchantFunding.create({
      data: {
        businessId,
        amountMinor: BigInt(dto.amountMinor),
        currency: dto.currency,
        fundingMethod: dto.fundingMethod,
        providerReference: dto.providerReference,
        status: 'pending',
        idempotencyKey: `funding:${businessId}:${idempotencyKey}`,
        requestedBy: p.userId,
      },
    });
    await this.audit.record({ actorUserId: p.userId, businessId, action: 'funding.requested', objectType: 'merchant_funding', objectId: funding.id, after: funding });
    if (dto.fundingMethod === 'bank_transfer') {
      return { funding, instructions: 'Transfer the amount using the reference shown. CODEK operations confirm funding once the transfer is received.' };
    }
    const outcome = await provider!.createFunding({ fundingId: funding.id, businessId, amountMinor: funding.amountMinor, currency: funding.currency, method: dto.fundingMethod, idempotencyKey: funding.id });
    if (outcome.status === 'confirmed') {
      const confirmed = await this.prisma.$transaction((tx) => this.confirmInTx(tx, funding, { provider: provider!.name, environment: provider!.environment, providerTransactionId: outcome.providerTransactionId }, null));
      return { funding: confirmed };
    }
    if (outcome.status === 'failed') {
      await this.prisma.merchantFunding.update({ where: { id: funding.id }, data: { status: 'failed', failureReason: outcome.errorCode } });
      throw new ApiError('PROVIDER_ERROR', outcome.errorMessageSafe);
    }
    return { funding, instructions: outcome.instructions };
  }

  /** Admin confirms a received bank transfer (audited financial action). */
  async adminConfirm(p: Principal, fundingId: string, providerReference: string) {
    this.access.platform(p, 'admin.finance.operate');
    const f = await this.prisma.merchantFunding.findUnique({ where: { id: fundingId } });
    if (!f) throw notFound('Funding');
    return this.prisma.$transaction((tx) => this.confirmInTx(tx, f, { provider: 'bank_transfer', environment: this.env.APP_ENV === 'production' ? 'live' : 'test', providerTransactionId: providerReference }, p.userId));
  }

  async adminFail(p: Principal, fundingId: string, reason: string) {
    this.access.platform(p, 'admin.finance.operate');
    const f = await this.prisma.merchantFunding.findUnique({ where: { id: fundingId } });
    if (!f) throw notFound('Funding');
    assertTransition(FundingMachine, f.status as FundingStatus, 'failed');
    await this.prisma.$transaction(async (tx) => {
      await tx.merchantFunding.update({ where: { id: fundingId }, data: { status: 'failed', failureReason: reason } });
      await this.audit.record({ actorUserId: p.userId, businessId: f.businessId, action: 'funding.failed', objectType: 'merchant_funding', objectId: fundingId, reason }, tx);
    });
    return this.prisma.merchantFunding.findUniqueOrThrow({ where: { id: fundingId } });
  }

  private async confirmInTx(tx: TransactionClient, f: MerchantFunding, prov: { provider: string; environment: 'test' | 'live'; providerTransactionId: string }, actorUserId: string | null) {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM merchant_fundings WHERE id = ${f.id}::uuid FOR UPDATE`;
    if (locked[0]?.status === 'confirmed') return tx.merchantFunding.findUniqueOrThrow({ where: { id: f.id } });
    assertTransition(FundingMachine, locked[0]!.status as FundingStatus, 'confirmed');
    const ptx = await tx.paymentProviderTransaction.upsert({
      where: { provider_environment_providerTransactionId: { provider: prov.provider, environment: prov.environment, providerTransactionId: prov.providerTransactionId } },
      update: {},
      create: { provider: prov.provider, environment: prov.environment, providerTransactionId: prov.providerTransactionId, transactionType: 'merchant_funding', status: 'succeeded', amountMinor: f.amountMinor, currency: f.currency, relatedEntityType: 'merchant_funding', relatedEntityId: f.id, occurredAt: new Date() },
    });
    if (ptx.relatedEntityId !== f.id) throw new ApiError('CONFLICT', 'This provider reference is already linked to another funding');
    await this.ledger.post(tx, Postings.fundingReceived(f.businessId, f.currency, f.amountMinor), {
      businessId: f.businessId,
      referenceType: 'merchant_funding',
      referenceId: f.id,
      idempotencyKey: `funding:${f.id}:received`,
      description: `Funding received via ${prov.provider}`,
      createdBy: actorUserId,
    });
    await tx.merchantFunding.update({ where: { id: f.id }, data: { status: 'confirmed', receivedAt: new Date(), providerTransactionId: ptx.id, confirmedBy: actorUserId } });
    await this.audit.record({ actorUserId, actorType: actorUserId ? 'admin' : 'system', businessId: f.businessId, action: 'funding.confirmed', objectType: 'merchant_funding', objectId: f.id, after: { amountMinor: f.amountMinor, currency: f.currency, provider: prov.provider } }, tx);
    await this.outbox.enqueue(tx, { eventType: 'FundingReceived', aggregateType: 'merchant_funding', aggregateId: f.id, businessId: f.businessId, payload: { fundingId: f.id, amountMinor: f.amountMinor, currency: f.currency } });
    await this.commissions.allocateFunding(tx, f.businessId, f.currency);
    await this.commissions.releaseDue(tx, new Date(), { businessId: f.businessId });
    return tx.merchantFunding.findUniqueOrThrow({ where: { id: f.id } });
  }

  /** Funding overview: ledger-derived balances plus the shortfall of approved-but-unfunded obligations. */
  async overview(p: Principal, businessId: string) {
    this.access.businessAccess(p, businessId, 'funding.read');
    const [fundings, balances, unfunded] = await Promise.all([
      this.prisma.merchantFunding.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.ledger.ownerBalances(this.prisma, 'business', businessId),
      this.prisma.commissionCalculation.groupBy({ by: ['currency'], where: { businessId, status: 'approved' }, _sum: { commissionMinor: true, reversedMinor: true, clawbackMinor: true, feeMinor: true, feeReversedMinor: true }, _count: true }),
    ]);
    const byCurrency = new Map<string, { currency: string; fundingBalanceMinor: bigint; outstandingObligationsMinor: bigint; shortfallMinor: bigint; approvedUnfundedCount: number }>();
    const ensure = (c: string) => {
      if (!byCurrency.has(c)) byCurrency.set(c, { currency: c, fundingBalanceMinor: 0n, outstandingObligationsMinor: 0n, shortfallMinor: 0n, approvedUnfundedCount: 0 });
      return byCurrency.get(c)!;
    };
    for (const b of balances) {
      if (b.accountType === 'merchant_funding') ensure(b.currency).fundingBalanceMinor = b.balanceMinor;
      if (b.accountType === 'merchant_receivable') ensure(b.currency).outstandingObligationsMinor = b.balanceMinor;
    }
    for (const u of unfunded) {
      const row = ensure(u.currency);
      const need = (u._sum.commissionMinor ?? 0n) - (u._sum.reversedMinor ?? 0n) - (u._sum.clawbackMinor ?? 0n) + (u._sum.feeMinor ?? 0n) - (u._sum.feeReversedMinor ?? 0n);
      row.shortfallMinor = need > row.fundingBalanceMinor ? need - row.fundingBalanceMinor : 0n;
      row.approvedUnfundedCount = u._count;
    }
    return {
      balances: [...byCurrency.values()],
      fundings,
      methods: ['bank_transfer', ...this.providers.flatMap((pr) => pr.methods)],
      note: 'Funding covers your creator commissions and CODEK fees. Balances are calculated from CODEK’s financial records.',
    };
  }
}
