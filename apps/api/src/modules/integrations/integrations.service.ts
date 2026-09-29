import { Inject, Injectable } from '@nestjs/common';
import type { Integration, PrismaClient } from '@codek/database';
import { assertTransition, IntegrationMachine, type IntegrationStatus } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { SECRET_STORE, type SecretStore } from '../../secrets/secret-store';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import type { Principal } from '../../auth/principal';
import { AdapterRegistry } from './adapters/registry';

/** Integration lifecycle (spec §11.2): Not Connected → Connecting → Connected → Testing → Live → Paused/Error → Disconnected. */
@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(SECRET_STORE) private readonly secrets: SecretStore,
    private readonly registry: AdapterRegistry,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  providers() {
    return this.registry.list().map((a) => ({ provider: a.provider, displayName: a.displayName, category: a.category, authMethods: a.authMethods }));
  }

  webhookUrl(provider: string): string {
    return `${this.env.API_PUBLIC_URL.replace(/\/$/, '')}/api/v1/webhooks/${provider}`;
  }

  /** Public view: never includes secrets. */
  view(i: Integration) {
    return {
      id: i.id,
      businessId: i.businessId,
      provider: i.provider,
      category: i.category,
      displayName: i.displayName,
      environment: i.environment,
      status: i.status,
      config: i.config,
      externalAccountRef: i.externalAccountRef,
      healthStatus: i.healthStatus,
      lastTestAt: i.lastTestAt,
      lastTestResult: i.lastTestResult,
      lastSuccessAt: i.lastSuccessAt,
      lastErrorCode: i.lastErrorCode,
      disconnectedAt: i.disconnectedAt,
      webhookUrl: this.webhookUrl(i.provider),
      createdAt: i.createdAt,
    };
  }

  async list(p: Principal, businessId: string) {
    this.access.businessAccess(p, businessId, 'integration.manage');
    const rows = await this.prisma.integration.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.view(r));
  }

  async load(p: Principal, id: string): Promise<Integration> {
    const i = await this.prisma.integration.findUnique({ where: { id } });
    if (!i) throw notFound('Integration');
    if (!p.platformPermissions.has('admin.integrations.manage')) this.access.businessAccess(p, i.businessId, 'integration.manage');
    return i;
  }

  async connect(p: Principal, provider: string, dto: { businessId: string; displayName?: string; config: Record<string, unknown>; credentials: Record<string, string> }) {
    this.access.businessAccess(p, dto.businessId, 'integration.manage');
    const adapter = this.registry.get(provider);
    if (!adapter) throw notFound('Integration provider');
    const config = adapter.configSchema.parse(dto.config ?? {});
    const credentials = adapter.credentialsSchema.parse(dto.credentials ?? {});
    const result = await adapter.connect({ config, credentials });
    if (result.externalAccountRef) {
      const taken = await this.prisma.integration.findFirst({ where: { provider, externalAccountRef: result.externalAccountRef, status: { not: 'disconnected' } } });
      if (taken) throw new ApiError('CONFLICT', 'This account is already connected to CODEK');
    }
    const integration = await this.prisma.$transaction(async (tx) => {
      const created = await tx.integration.create({
        data: { businessId: dto.businessId, provider, category: adapter.category, displayName: dto.displayName ?? adapter.displayName, environment: 'test', status: 'connecting', config: result.config as object, externalAccountRef: result.externalAccountRef },
      });
      for (const [type, value] of Object.entries(result.secrets)) {
        const key = `integration/${created.id}/${type}`;
        await this.secrets.put(key, value);
        await tx.integrationCredentialRef.create({ data: { integrationId: created.id, secretManagerKey: key, credentialType: type } });
      }
      assertTransition(IntegrationMachine, 'connecting', 'connected');
      const connected = await tx.integration.update({ where: { id: created.id }, data: { status: 'connected' } });
      await this.audit.record({ actorUserId: p.userId, businessId: dto.businessId, action: 'integration.connected', objectType: 'integration', objectId: created.id, after: { provider, externalAccountRef: result.externalAccountRef, credentialTypes: Object.keys(result.secrets) } }, tx);
      return connected;
    });
    return { integration: this.view(integration), revealOnce: result.revealOnce ?? null, note: result.revealOnce ? 'Copy this secret now. For your security it will not be shown again.' : null };
  }

  async loadSecrets(integrationId: string): Promise<Record<string, string>> {
    const refs = await this.prisma.integrationCredentialRef.findMany({ where: { integrationId, revokedAt: null } });
    const out: Record<string, string> = {};
    for (const r of refs) {
      const v = await this.secrets.get(r.secretManagerKey);
      if (v != null) out[r.credentialType] = v;
    }
    return out;
  }

  private async transition(p: Principal, i: Integration, to: IntegrationStatus, extra: Record<string, unknown> = {}, action = `integration.${to}`) {
    assertTransition(IntegrationMachine, i.status as IntegrationStatus, to);
    const updated = await this.prisma.integration.update({ where: { id: i.id }, data: { status: to, version: { increment: 1 }, ...extra } });
    await this.audit.record({ actorUserId: p.userId, businessId: i.businessId, action, objectType: 'integration', objectId: i.id, before: { status: i.status }, after: { status: to } });
    return this.view(updated);
  }

  async test(p: Principal, id: string) {
    const i = await this.load(p, id);
    const adapter = this.registry.get(i.provider)!;
    const result = await adapter.test((i.config ?? {}) as Record<string, unknown>, await this.loadSecrets(i.id));
    const target: IntegrationStatus = result.ok ? 'testing' : 'error';
    if (i.status === target) {
      await this.prisma.integration.update({ where: { id }, data: { lastTestAt: new Date(), lastTestResult: result.detail } });
      return { ...this.view(await this.prisma.integration.findUniqueOrThrow({ where: { id } })), test: result };
    }
    const view = await this.transition(p, i, target, { lastTestAt: new Date(), lastTestResult: result.detail, healthStatus: result.ok ? 'awaiting_test_event' : 'error', lastErrorCode: result.ok ? null : 'CONNECTION_TEST_FAILED' });
    return { ...view, test: result };
  }

  /** Go live only after a successful test (valid test event or provider check). Test mode must precede live (spec §11.7). */
  async goLive(p: Principal, id: string) {
    const i = await this.load(p, id);
    if (i.status !== 'testing' || !['test_event_ok', 'ok'].includes(i.healthStatus ?? '')) {
      throw ruleViolation('Run a connection test and send a test event before going live', { status: i.status, health: i.healthStatus });
    }
    return this.transition(p, i, 'live', { environment: 'live', healthStatus: 'ok' });
  }

  async pause(p: Principal, id: string) {
    return this.transition(p, await this.load(p, id), 'paused');
  }

  async resume(p: Principal, id: string) {
    return this.transition(p, await this.load(p, id), 'live');
  }

  /** Disconnect keeps all history and evidence; only credentials are revoked (spec §11.7). */
  async disconnect(p: Principal, id: string) {
    const i = await this.load(p, id);
    const refs = await this.prisma.integrationCredentialRef.findMany({ where: { integrationId: id, revokedAt: null } });
    for (const r of refs) await this.secrets.delete(r.secretManagerKey);
    await this.prisma.integrationCredentialRef.updateMany({ where: { integrationId: id }, data: { revokedAt: new Date() } });
    return this.transition(p, i, 'disconnected', { disconnectedAt: new Date() });
  }

  async rotateSecret(p: Principal, id: string) {
    const i = await this.load(p, id);
    if (i.provider !== 'custom') throw ruleViolation('Rotate this secret in the provider’s dashboard, then reconnect');
    const adapter = this.registry.get('custom')!;
    const r = await adapter.connect({ config: (i.config ?? {}) as Record<string, unknown>, credentials: {} });
    const ref = await this.prisma.integrationCredentialRef.findFirstOrThrow({ where: { integrationId: id, credentialType: 'signing_secret', revokedAt: null } });
    await this.secrets.put(ref.secretManagerKey, r.secrets.signing_secret!);
    await this.prisma.integrationCredentialRef.update({ where: { id: ref.id }, data: { rotatedAt: new Date() } });
    await this.audit.record({ actorUserId: p.userId, businessId: i.businessId, action: 'integration.secret_rotated', objectType: 'integration', objectId: id });
    return { revealOnce: r.revealOnce, note: 'Copy this secret now. The previous secret stops working immediately.' };
  }

  async health(p: Principal, id: string) {
    const i = await this.load(p, id);
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const counts = await this.prisma.webhookEvent.groupBy({ by: ['processingState'], where: { integrationId: id, receivedAt: { gte: since } }, _count: true });
    const invalid = await this.prisma.webhookEvent.count({ where: { integrationId: id, receivedAt: { gte: since }, OR: [{ signatureValid: false }, { replayCheckPassed: false }] } });
    const lastRecon = await this.prisma.reconciliation.findFirst({ where: { integrationId: id }, orderBy: { startedAt: 'desc' }, include: { _count: { select: { items: true } } } });
    return {
      integration: this.view(i),
      last24h: Object.fromEntries(counts.map((c) => [c.processingState, c._count])),
      rejectedSignaturesOrReplays24h: invalid,
      lastReconciliation: lastRecon ? { id: lastRecon.id, status: lastRecon.status, startedAt: lastRecon.startedAt, completedAt: lastRecon.completedAt, summary: lastRecon.summaryJson } : null,
    };
  }

  async webhookEvents(p: Principal, id: string, limit = 50) {
    const i = await this.load(p, id);
    return this.prisma.webhookEvent.findMany({
      where: { integrationId: i.id },
      orderBy: { receivedAt: 'desc' },
      take: Math.min(limit, 200),
      select: { id: true, eventType: true, providerEventId: true, signatureValid: true, replayCheckPassed: true, processingState: true, retryCount: true, lastErrorCode: true, receivedAt: true, processedAt: true },
    });
  }
}
