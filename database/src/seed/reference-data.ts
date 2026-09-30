import { createHash } from 'node:crypto';
import { PERMISSIONS, ROLE_DEFINITIONS } from '@codek/domain';
import type { PrismaClient } from '../generated/prisma/client';

/**
 * Idempotent reference data required in every environment: RBAC catalogue, default pricing/fee plan,
 * system settings / feature flags and versioned legal document records.
 * Values that are genuine owner decisions are seeded as conservative placeholders and flagged (docs/DECISIONS.md).
 */
export const LEGAL_DOCUMENT_TYPES = [
  { type: 'terms_of_service', title: 'Terms of Service', requiredFor: ['business', 'creator'] },
  { type: 'privacy_policy', title: 'Privacy Policy', requiredFor: ['business', 'creator'] },
  { type: 'business_agreement', title: 'Business Agreement', requiredFor: ['business'] },
  { type: 'creator_agreement', title: 'Creator Agreement', requiredFor: ['creator'] },
  { type: 'commission_terms', title: 'Commission Terms', requiredFor: ['business', 'creator'] },
  { type: 'refund_dispute_policy', title: 'Refund & Dispute Policy', requiredFor: [] },
  { type: 'content_rights_terms', title: 'Content Rights & Usage Terms', requiredFor: [] },
  { type: 'prohibited_categories', title: 'Prohibited Categories', requiredFor: [] },
] as const;

export const PLACEHOLDER_LEGAL_VERSION = '0.1-draft';

export const DEFAULT_SETTINGS: Array<{ key: string; kind: 'setting' | 'feature_flag'; value: unknown; description: string }> = [
  { key: 'campaigns.auto_publish_verified', kind: 'feature_flag', value: true, description: 'Verified businesses skip manual campaign review (D-011)' },
  { key: 'payouts.minimum_minor', kind: 'setting', value: { default: 0 }, description: 'Minimum payout per currency in minor units. DECISION NEEDED D-017 (placeholder 0).' },
  { key: 'payouts.enabled', kind: 'feature_flag', value: true, description: 'Allow creators to request payouts' },
  { key: 'admin.dual_approval_threshold_minor', kind: 'setting', value: { default: 0 }, description: 'Manual financial adjustments at or above this amount require a second approver (0 = always).' },
  { key: 'funding.manual_confirmation_required', kind: 'setting', value: true, description: 'Bank-transfer fundings require admin confirmation' },
  { key: 'retention.tracking_days', kind: 'setting', value: { days: 400, placeholder: true }, description: 'Tracking data retention. DECISION NEEDED D-021 (placeholder).' },
  { key: 'retention.webhook_raw_days', kind: 'setting', value: { days: 730, placeholder: true }, description: 'Raw webhook payload retention. DECISION NEEDED D-021 (placeholder).' },
  { key: 'messaging.rate_limit_per_minute', kind: 'setting', value: { max: 20 }, description: 'Messages per user per minute' },
  { key: 'fraud.conversion_spike_threshold', kind: 'setting', value: { perHour: 50 }, description: 'Conversions per partnership per hour that raise a spike signal' },
  { key: 'fraud.refund_spike_ratio', kind: 'setting', value: { ratio: '0.5', minConversions: 10 }, description: 'Refund ratio that raises a refund-spike signal' },
  { key: 'integrations.shopify.enabled', kind: 'feature_flag', value: true, description: 'Shopify adapter available to businesses' },
  { key: 'billing.subscriptions.enabled', kind: 'feature_flag', value: false, description: 'Subscription billing (pricing not yet decided, D-003)' },
];

export async function seedReferenceData(prisma: PrismaClient, opts: { environment?: 'dev' | 'staging' | 'production' } = {}): Promise<void> {
  const environment = opts.environment ?? 'dev';
  // Permissions
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));
  // Roles + role_permissions (exact sync with the domain catalogue)
  for (const def of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: { scope: def.scope, description: def.description },
      create: { name: def.name, scope: def.scope, description: def.description },
    });
    const wanted = new Set(def.permissions.map((p) => permId.get(p)!));
    const existing = await prisma.rolePermission.findMany({ where: { roleId: role.id } });
    for (const rp of existing) if (!wanted.has(rp.permissionId)) await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: rp.permissionId } } });
    const have = new Set(existing.map((e) => e.permissionId));
    const toAdd = [...wanted].filter((id) => !have.has(id));
    if (toAdd.length) await prisma.rolePermission.createMany({ data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })) });
  }
  // Default pricing / fee plan (0 fee until D-003 is decided)
  await prisma.pricingPlan.upsert({
    where: { planKey: 'default' },
    update: {},
    create: {
      planKey: 'default',
      name: 'Default (pricing pending)',
      description: 'No CODEK fee is charged until pricing is decided (DECISION NEEDED D-003).',
      feePlanJson: { planKey: 'default', basis: 'none', rate: null, roundingMode: 'half_up' },
      isDefault: true,
    },
  });
  // Settings / feature flags (never overwrite values an operator changed)
  for (const s of DEFAULT_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, kind: s.kind, valueJson: s.value as object, description: s.description, environment },
    });
  }
  // Legal documents (D-022). Outside production, placeholders are published so sign-up and acceptance can be exercised.
  // In production they are created as DRAFTS: an administrator publishes counsel-approved versions (Admin → Legal),
  // and sign-up stays closed until every required document type is published.
  const publishPlaceholders = environment !== 'production';
  for (const doc of LEGAL_DOCUMENT_TYPES) {
    const content = `# ${doc.title}\n\nDRAFT PLACEHOLDER — version ${PLACEHOLDER_LEGAL_VERSION}.\n\nThis document has not been reviewed by legal counsel and must be replaced before production launch (docs/DECISIONS.md D-022).`;
    const existing = await prisma.legalDocument.findFirst({ where: { documentType: doc.type, version: PLACEHOLDER_LEGAL_VERSION, jurisdiction: null } });
    if (!existing) {
      await prisma.legalDocument.create({
        data: {
          documentType: doc.type,
          version: PLACEHOLDER_LEGAL_VERSION,
          jurisdiction: null,
          title: doc.title,
          content,
          contentHash: createHash('sha256').update(content).digest('hex'),
          status: publishPlaceholders ? 'published' : 'draft',
          requiredFor: [...doc.requiredFor],
          publishedAt: publishPlaceholders ? new Date() : null,
        },
      });
    }
  }
}
