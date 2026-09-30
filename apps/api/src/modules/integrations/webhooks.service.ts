import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Integration, PrismaClient, WebhookEvent } from '@codek/database';
import { DomainError, NORMALIZED_SCHEMA_VERSION } from '@codek/domain';
import type { Env } from '@codek/config';
import { ZodError } from 'zod';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUES } from '../../queue/queues';
import { ApiError } from '../../common/errors';
import { currentContext } from '../../common/request-context';
import { ConversionsService } from '../conversions/conversions.service';
import { AdapterRegistry } from './adapters/registry';
import { IntegrationsService } from './integrations.service';

export interface IngestHttpResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Webhook pipeline (spec §11.4): verify signature → timestamp/replay check → event id/idempotency → store raw event →
 * queue → process → normalize → apply domain effect. Invalid or replayed deliveries are stored as evidence but never
 * processed. Duplicate deliveries are acknowledged without effect.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('WebhooksService');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly registry: AdapterRegistry,
    private readonly integrations: IntegrationsService,
    private readonly conversions: ConversionsService,
    private readonly queues: QueueService,
    private readonly audit: AuditService,
  ) {}

  async receive(provider: string, headers: IncomingHttpHeaders, rawBody: Buffer | undefined): Promise<IngestHttpResult> {
    const adapter = this.registry.get(provider);
    if (!adapter) throw new ApiError('NOT_FOUND', 'Unknown webhook provider');
    if (!rawBody || rawBody.length === 0) throw new ApiError('BAD_REQUEST', 'Empty webhook body');
    const who = adapter.identify(headers);
    if (!who) throw new ApiError('WEBHOOK_SIGNATURE_INVALID', 'Webhook could not be authenticated');
    const integration = who.integrationId
      ? await this.prisma.integration.findFirst({ where: { id: who.integrationId, provider } })
      : await this.prisma.integration.findFirst({ where: { provider, externalAccountRef: who.externalAccountRef, status: { not: 'disconnected' } }, orderBy: { createdAt: 'desc' } });
    // Unknown integration: same response as a bad signature (no enumeration of integrations).
    if (!integration) throw new ApiError('WEBHOOK_SIGNATURE_INVALID', 'Webhook could not be authenticated');
    const secrets = await this.integrations.loadSecrets(integration.id);
    const v = adapter.verifyWebhook(headers, rawBody, secrets, this.env.WEBHOOK_TOLERANCE_SECONDS);
    let payload: unknown;
    let malformed = false;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      malformed = true;
      payload = { malformed: true, bodyPrefix: rawBody.toString('utf8').slice(0, 2000) };
    }
    const isTest = String(headers['x-codek-test'] ?? '').toLowerCase() === 'true';
    const correlationId = currentContext()?.correlationId ?? randomUUID();
    const idempotencyKey = v.signatureValid && v.providerEventId ? `${provider}:${integration.id}:${v.providerEventId}` : null;
    const base = {
      integrationId: integration.id,
      businessId: integration.businessId,
      provider,
      eventType: v.eventType.slice(0, 100),
      schemaVersion: NORMALIZED_SCHEMA_VERSION,
      providerEventId: v.providerEventId?.slice(0, 255) ?? null,
      signatureValid: v.signatureValid,
      replayCheckPassed: v.replayCheckPassed,
      occurredAt: v.occurredAt,
      rawPayload: payload as object,
      correlationId,
    };

    if (!v.signatureValid || !v.replayCheckPassed) {
      await this.prisma.webhookEvent.create({ data: { ...base, idempotencyKey: null, processingState: 'ignored', lastErrorCode: !v.signatureValid ? 'INVALID_SIGNATURE' : 'REPLAY_REJECTED' } });
      if (v.signatureValid && !v.replayCheckPassed) {
        await this.prisma.fraudFlag.create({ data: { businessId: integration.businessId, subjectType: 'integration', subjectId: integration.id, signalType: 'webhook_replay', severity: 'medium', evidenceJson: { providerEventId: v.providerEventId, occurredAt: v.occurredAt }, dedupeKey: `webhook_replay:${integration.id}:${v.providerEventId ?? randomUUID()}` } }).catch(() => undefined);
      }
      throw new ApiError(!v.signatureValid ? 'WEBHOOK_SIGNATURE_INVALID' : 'WEBHOOK_REPLAY_REJECTED', 'Webhook could not be authenticated');
    }
    if (!v.providerEventId) throw new ApiError('BAD_REQUEST', 'Missing event id header');
    if (integration.status === 'disconnected' || integration.status === 'not_connected') {
      await this.prisma.webhookEvent.create({ data: { ...base, idempotencyKey: `${idempotencyKey}:ignored:${randomUUID()}`, processingState: 'ignored', lastErrorCode: 'INTEGRATION_DISCONNECTED' } });
      return { status: 200, body: { received: true, processed: false, reason: 'integration_disconnected' } };
    }
    const id = randomUUID();
    const inserted = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO webhook_events (id, integration_id, business_id, provider, event_type, schema_version, provider_event_id, signature_valid, replay_check_passed,
                                  idempotency_key, occurred_at, received_at, raw_payload, processing_state, retry_count, correlation_id)
      VALUES (${id}::uuid, ${integration.id}::uuid, ${integration.businessId}::uuid, ${provider}, ${base.eventType}, ${base.schemaVersion}, ${base.providerEventId},
              true, true, ${idempotencyKey}, ${v.occurredAt}, now(), ${JSON.stringify(payload)}::jsonb,
              ${malformed ? 'dead_letter' : 'received'}::"WebhookProcessingState", 0, ${correlationId})
      ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`;
    if (!inserted.length) return { status: 200, body: { received: true, duplicate: true } };
    if (malformed) {
      await this.prisma.webhookEvent.update({ where: { id }, data: { lastErrorCode: 'MALFORMED_JSON' } });
      return { status: 400, body: { received: true, processed: false, reason: 'malformed_payload' } };
    }
    if (isTest || integration.status === 'testing' || integration.status === 'connected') {
      // Test mode: validate and normalize (dry run) without creating conversions.
      const dry = await this.dryRun(integration, id, base.eventType, payload);
      return { status: 200, body: { received: true, testMode: true, ...dry } };
    }
    if (integration.status === 'paused' || integration.status === 'error') {
      await this.prisma.webhookEvent.update({ where: { id }, data: { processingState: 'received', lastErrorCode: `INTEGRATION_${integration.status.toUpperCase()}` } });
      return { status: 202, body: { received: true, queued: false, reason: `integration_${integration.status}` } };
    }
    const queued = await this.queues.add(QUEUES.webhookProcessing, 'process', { webhookEventId: id }, { jobId: `wh-${id}` });
    if (queued) await this.prisma.webhookEvent.update({ where: { id }, data: { processingState: 'queued' } });
    return { status: 202, body: { received: true, queued } };
  }

  private async dryRun(integration: Integration, id: string, eventType: string, payload: unknown) {
    const adapter = this.registry.get(integration.provider)!;
    try {
      const r = adapter.normalize(eventType, payload);
      const ok = 'events' in r;
      await this.prisma.webhookEvent.update({ where: { id }, data: { processingState: ok ? 'processed' : 'ignored', processedAt: new Date(), lastErrorCode: ok ? 'TEST_MODE_DRY_RUN' : r.ignored.slice(0, 100) } });
      if (ok && integration.status === 'testing') await this.prisma.integration.update({ where: { id: integration.id }, data: { healthStatus: 'test_event_ok', lastSuccessAt: new Date() } });
      return { valid: ok, normalizedEvents: ok ? r.events.length : 0, note: ok ? 'Test event validated. No sales were recorded.' : r.ignored };
    } catch (e) {
      await this.prisma.webhookEvent.update({ where: { id }, data: { processingState: 'failed', lastErrorCode: 'NORMALIZATION_FAILED', lastErrorMessage: safeError(e) } });
      return { valid: false, note: 'The event could not be read. Check the payload format.', issues: e instanceof ZodError ? e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) : undefined };
    }
  }

  /**
   * Worker step: process one stored event. Idempotent (terminal states are no-ops; conversions dedupe by event id).
   * Throws for transient errors (BullMQ retries with backoff); permanent errors go straight to dead_letter.
   */
  async process(webhookEventId: string, attempt = 1, maxAttempts = 6): Promise<WebhookEvent['processingState']> {
    const ev = await this.prisma.webhookEvent.findUnique({ where: { id: webhookEventId }, include: { integration: true } });
    if (!ev) return 'ignored';
    if (['processed', 'ignored', 'dead_letter'].includes(ev.processingState)) return ev.processingState;
    if (!ev.integration || ev.integration.status !== 'live') {
      await this.prisma.webhookEvent.update({ where: { id: ev.id }, data: { processingState: 'received', lastErrorCode: 'INTEGRATION_NOT_LIVE' } });
      return 'received';
    }
    await this.prisma.webhookEvent.update({ where: { id: ev.id }, data: { processingState: 'processing', retryCount: { increment: 1 } } });
    const adapter = this.registry.get(ev.provider)!;
    try {
      const normalized = adapter.normalize(ev.eventType, ev.rawPayload);
      if ('ignored' in normalized) {
        await this.prisma.webhookEvent.update({ where: { id: ev.id }, data: { processingState: 'ignored', processedAt: new Date(), lastErrorCode: normalized.ignored.slice(0, 100) } });
        return 'ignored';
      }
      for (const event of normalized.events) {
        await this.conversions.ingest({ businessId: ev.integration.businessId, integrationId: ev.integration.id, sourceSystem: ev.provider, verifiedState: 'verified', webhookEventId: ev.id, event, correlationId: ev.correlationId });
      }
      await this.prisma.webhookEvent.update({ where: { id: ev.id }, data: { processingState: 'processed', processedAt: new Date(), lastErrorCode: null, lastErrorMessage: null } });
      await this.prisma.integration.update({ where: { id: ev.integration.id }, data: { lastSuccessAt: new Date(), healthStatus: 'ok' } });
      return 'processed';
    } catch (e) {
      const permanent = e instanceof ZodError || e instanceof DomainError || (e instanceof Error && e.message.startsWith('MALFORMED'));
      const final = permanent || attempt >= maxAttempts;
      await this.prisma.webhookEvent.update({
        where: { id: ev.id },
        data: { processingState: final ? 'dead_letter' : 'failed', lastErrorCode: permanent ? 'PERMANENT_PROCESSING_ERROR' : 'TRANSIENT_PROCESSING_ERROR', lastErrorMessage: safeError(e) },
      });
      if (final) {
        await this.queues.add(QUEUES.deadLetter, 'webhook', { webhookEventId: ev.id, reason: safeError(e) });
        await this.audit.record({ actorType: 'system', businessId: ev.integration.businessId, action: 'webhook.dead_lettered', objectType: 'webhook_event', objectId: ev.id, reason: safeError(e) });
        return 'dead_letter';
      }
      throw e;
    }
  }

  /** Admin/ops replay of a stored event (e.g. after fixing a mapping). Safe: downstream is idempotent. */
  async replay(webhookEventId: string, actorUserId: string): Promise<{ queued: boolean }> {
    const ev = await this.prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
    if (!ev || !ev.signatureValid || !ev.replayCheckPassed) throw new ApiError('NOT_FOUND', 'Replayable webhook event not found');
    await this.prisma.webhookEvent.update({ where: { id: ev.id }, data: { processingState: 'queued', lastErrorCode: null } });
    await this.audit.record({ actorUserId, businessId: ev.businessId, action: 'webhook.replayed', objectType: 'webhook_event', objectId: ev.id });
    return { queued: await this.queues.add(QUEUES.webhookProcessing, 'process', { webhookEventId: ev.id }, { jobId: `wh-${ev.id}-replay-${Date.now()}` }) };
  }

  /**
   * Sweeper: re-enqueue events stuck in received/queued/failed (e.g. Redis was down when they arrived) and events left
   * in `processing` by a worker that died mid-run or whose job was lost. Re-processing is safe: conversions dedupe by
   * event id under a per-order lock.
   */
  async sweep(olderThanMs = 120_000, stuckProcessingMs = 15 * 60_000): Promise<number> {
    const now = Date.now();
    const stuck = await this.prisma.webhookEvent.findMany({
      where: {
        signatureValid: true,
        replayCheckPassed: true,
        integration: { status: 'live' },
        OR: [
          { processingState: { in: ['received', 'queued', 'failed'] }, receivedAt: { lte: new Date(now - olderThanMs) } },
          { processingState: 'processing', receivedAt: { lte: new Date(now - stuckProcessingMs) } },
        ],
      },
      select: { id: true },
      take: 500,
    });
    for (const s of stuck) await this.queues.add(QUEUES.webhookProcessing, 'process', { webhookEventId: s.id }, { jobId: `wh-${s.id}-sweep-${Math.floor(Date.now() / 60000)}` });
    return stuck.length;
  }
}

function safeError(e: unknown): string {
  if (e instanceof ZodError) return `validation: ${e.issues.slice(0, 5).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`.slice(0, 500);
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
