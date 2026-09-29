'use client';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea } from '@codek/ui';
import { errorMessage, toMinorUnits, useApi } from '@/lib/api';
import { exponentOf, isoToLocal, localToIso, minorToInput, percentToRate, rateToPercent } from '@/lib/rates';

export interface CampaignFormValue {
  catalogItemId: string;
  name: string;
  description: string;
  category: string;
  timezone: string;
  startAt: string;
  endAt: string;
  applicationDeadlineAt: string;
  participantCap: string;
  waitlistEnabled: boolean;
  compensationType: string;
  productServiceProvided: boolean;
  destinationUrl: string;
  conversionSourceType: string;
  integrationId: string;
  fulfillmentMode: string;
  locationCountry: string;
  locationCity: string;
  platforms: string;
  currency: string;
  discountType: string;
  discountPercent: string;
  discountAmount: string;
  discountDescription: string;
  commissionType: string;
  commissionPercent: string;
  commissionFixed: string;
  baseType: string;
  includeTax: boolean;
  includeShipping: boolean;
  minAmount: string;
  maxAmount: string;
  refundBehavior: string;
  attributionModel: string;
  windowDays: string;
  holdPeriodDays: string;
  conversionApprovalMode: string;
  deliverables: Array<{ type: string; description: string; dueDays: string; required: boolean }>;
  ownership: string;
  organicAllowed: boolean;
  paidAdsAllowed: boolean;
  whitelistingAllowed: boolean;
  rightsDurationDays: string;
  codeUsageLimit: string;
  codePrefix: string;
  cancellationRefundPolicy: string;
  disclosureText: string;
  minFollowers: string;
  minFollowersPlatform: string;
  countries: string;
  verifiedOnly: boolean;
}

export const EMPTY_CAMPAIGN: CampaignFormValue = {
  catalogItemId: '',
  name: '',
  description: '',
  category: '',
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  startAt: '',
  endAt: '',
  applicationDeadlineAt: '',
  participantCap: '',
  waitlistEnabled: false,
  compensationType: 'commission_only',
  productServiceProvided: false,
  destinationUrl: '',
  conversionSourceType: 'redemption_interface',
  integrationId: '',
  fulfillmentMode: 'online',
  locationCountry: '',
  locationCity: '',
  platforms: 'instagram, tiktok',
  currency: 'JOD',
  discountType: 'percentage',
  discountPercent: '10',
  discountAmount: '',
  discountDescription: '',
  commissionType: 'percentage',
  commissionPercent: '10',
  commissionFixed: '',
  baseType: 'discounted',
  includeTax: false,
  includeShipping: false,
  minAmount: '',
  maxAmount: '',
  refundBehavior: 'reverse',
  attributionModel: 'code_first',
  windowDays: '30',
  holdPeriodDays: '14',
  conversionApprovalMode: 'manual',
  deliverables: [{ type: 'instagram_post', description: '', dueDays: '7', required: true }],
  ownership: 'creator',
  organicAllowed: true,
  paidAdsAllowed: false,
  whitelistingAllowed: false,
  rightsDurationDays: '',
  codeUsageLimit: '',
  codePrefix: '',
  cancellationRefundPolicy: '',
  disclosureText: 'Use #ad or “Paid partnership” on every post.',
  minFollowers: '',
  minFollowersPlatform: '',
  countries: '',
  verifiedOnly: false,
};

/** Campaign detail as returned to business members (GET /campaigns/:id). */
export interface MemberCampaign {
  id: string;
  name: string;
  status: string;
  version: number;
  configVersion: number;
  description: string | null;
  category: string;
  timezone: string;
  currency: string;
  startAt: string | null;
  endAt: string | null;
  applicationDeadlineAt: string | null;
  participantCap: number | null;
  spotsLeft: number | null;
  waitlistEnabled: boolean;
  applicationsOpen: boolean;
  compensationType: string;
  productServiceProvided: boolean;
  destinationUrl: string | null;
  conversionSourceType: string;
  integrationId: string | null;
  fulfillmentMode: string;
  location: { country: string | null; city: string | null };
  platforms: string[];
  business: { id: string; displayName: string; verificationStatus: string };
  catalogItem: { id: string; name: string };
  customerDiscount: { type: string; rate?: string; amountMinor?: number; description?: string } | null;
  commissionTerms: { type: string; rate: string | null; fixedMinor: number | null; baseType: string; includeTax: boolean; includeShipping: boolean; minMinor: number | null; maxMinor: number | null; refundBehavior: string } | null;
  attribution: { model: string; windowDays: number };
  holdPeriodDays: number;
  conversionApprovalMode: string;
  deliverables: Array<{ type: string; description?: string; dueDays?: number; required?: boolean }> | null;
  contentRights: { ownership?: string; organicAllowed?: boolean; paidAdsAllowed?: boolean; whitelistingAllowed?: boolean; durationDays?: number } | null;
  promotionRules: { codeUsageLimit?: number; codePrefix?: string } | null;
  cancellationRefund: { policy?: string } | null;
  disclosureRequirements: { text?: string } | null;
  eligibility: Array<{ ruleType: string; value: { count?: number; platform?: string; countries?: string[] } }>;
}

/** Existing campaign (member detail view) → form values. */
export function campaignToForm(c: MemberCampaign): CampaignFormValue {
  const d = c.customerDiscount ?? { type: 'none' };
  const t = c.commissionTerms;
  const exp = exponentOf(c.currency);
  const rights = c.contentRights ?? {};
  const elig = c.eligibility ?? [];
  const mf = elig.find((e) => e.ruleType === 'min_followers');
  return {
    ...EMPTY_CAMPAIGN,
    catalogItemId: c.catalogItem.id,
    name: c.name ?? '',
    description: c.description ?? '',
    category: c.category ?? '',
    timezone: c.timezone ?? 'UTC',
    startAt: isoToLocal(c.startAt),
    endAt: isoToLocal(c.endAt),
    applicationDeadlineAt: isoToLocal(c.applicationDeadlineAt),
    participantCap: c.participantCap != null ? String(c.participantCap) : '',
    waitlistEnabled: !!c.waitlistEnabled,
    compensationType: c.compensationType,
    productServiceProvided: !!c.productServiceProvided,
    destinationUrl: c.destinationUrl ?? '',
    conversionSourceType: c.conversionSourceType,
    integrationId: c.integrationId ?? '',
    fulfillmentMode: c.fulfillmentMode,
    locationCountry: c.location?.country ?? '',
    locationCity: c.location?.city ?? '',
    platforms: (c.platforms ?? []).join(', '),
    currency: c.currency,
    discountType: d.type,
    discountPercent: d.type === 'percentage' ? rateToPercent(d.rate) : '',
    discountAmount: d.type === 'fixed' ? minorToInput(d.amountMinor, exp) : '',
    discountDescription: d.description ?? '',
    commissionType: t?.type ?? 'percentage',
    commissionPercent: t?.type === 'percentage' ? rateToPercent(t.rate) : '',
    commissionFixed: t?.type === 'fixed' ? minorToInput(t.fixedMinor, exp) : '',
    baseType: t?.baseType ?? 'discounted',
    includeTax: !!t?.includeTax,
    includeShipping: !!t?.includeShipping,
    minAmount: minorToInput(t?.minMinor, exp),
    maxAmount: minorToInput(t?.maxMinor, exp),
    refundBehavior: t?.refundBehavior ?? 'reverse',
    attributionModel: c.attribution?.model ?? 'code_first',
    windowDays: String(c.attribution?.windowDays ?? 30),
    holdPeriodDays: String(c.holdPeriodDays ?? 14),
    conversionApprovalMode: c.conversionApprovalMode ?? 'manual',
    deliverables: (c.deliverables ?? []).map((x) => ({ type: x.type, description: x.description ?? '', dueDays: x.dueDays != null ? String(x.dueDays) : '', required: x.required !== false })),
    ownership: rights.ownership ?? 'creator',
    organicAllowed: rights.organicAllowed ?? true,
    paidAdsAllowed: !!rights.paidAdsAllowed,
    whitelistingAllowed: !!rights.whitelistingAllowed,
    rightsDurationDays: rights.durationDays != null ? String(rights.durationDays) : '',
    codeUsageLimit: c.promotionRules?.codeUsageLimit != null ? String(c.promotionRules.codeUsageLimit) : '',
    codePrefix: c.promotionRules?.codePrefix ?? '',
    cancellationRefundPolicy: c.cancellationRefund?.policy ?? '',
    disclosureText: c.disclosureRequirements?.text ?? '',
    minFollowers: mf ? String(mf.value.count) : '',
    minFollowersPlatform: mf?.value.platform ?? '',
    countries: (elig.find((e) => e.ruleType === 'country')?.value.countries ?? []).join(', '),
    verifiedOnly: elig.some((e) => e.ruleType === 'verified_only'),
  };
}

const int = (v: string) => (v.trim() ? Number.parseInt(v, 10) : undefined);
const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

/** Form values → API payload. Returns field-level problems instead of guessing on invalid money/rate input. */
export function formToPayload(f: CampaignFormValue, mode: 'create' | 'edit'): { payload?: Record<string, unknown>; problems: Record<string, string> } {
  const problems: Record<string, string> = {};
  const money = (key: keyof CampaignFormValue, v: string) => {
    if (!v.trim()) return undefined;
    const m = toMinorUnits(v, f.currency);
    if (m == null) problems[key] = `Enter an amount in ${f.currency} (up to ${exponentOf(f.currency)} decimals)`;
    return m ?? undefined;
  };
  let discountConfig: Record<string, unknown> = { type: 'none' };
  if (f.discountType === 'percentage') {
    const rate = percentToRate(f.discountPercent);
    if (!rate) problems.discountPercent = 'Enter a percentage between 0 and 100';
    discountConfig = { type: 'percentage', rate, description: f.discountDescription || undefined };
  } else if (f.discountType === 'fixed') {
    discountConfig = { type: 'fixed', amountMinor: money('discountAmount', f.discountAmount), description: f.discountDescription || undefined };
  } else if (f.discountType === 'other') {
    discountConfig = { type: 'other', description: f.discountDescription };
  }
  const commission: Record<string, unknown> = {
    type: f.commissionType,
    baseType: f.baseType,
    includeTax: f.includeTax,
    includeShipping: f.includeShipping,
    minMinor: money('minAmount', f.minAmount),
    maxMinor: money('maxAmount', f.maxAmount),
    refundBehavior: f.refundBehavior,
  };
  if (f.commissionType === 'percentage') {
    const rate = percentToRate(f.commissionPercent);
    if (!rate) problems.commissionPercent = 'Enter a percentage between 0 and 100';
    commission.rate = rate;
  } else {
    commission.fixedMinor = money('commissionFixed', f.commissionFixed);
    if (commission.fixedMinor == null) problems.commissionFixed = problems.commissionFixed ?? 'Enter the commission per sale';
  }
  const eligibility: Array<Record<string, unknown>> = [];
  if (f.minFollowers.trim()) eligibility.push({ ruleType: 'min_followers', operator: 'gte', value: { count: int(f.minFollowers), platform: f.minFollowersPlatform || undefined } });
  if (f.countries.trim()) eligibility.push({ ruleType: 'country', operator: 'in', value: { countries: list(f.countries).map((c) => c.toUpperCase()) } });
  if (f.verifiedOnly) eligibility.push({ ruleType: 'verified_only', operator: 'eq', value: { verified: true } });
  const payload: Record<string, unknown> = {
    name: f.name,
    description: f.description || undefined,
    category: f.category,
    timezone: f.timezone,
    startAt: localToIso(f.startAt),
    endAt: localToIso(f.endAt),
    applicationDeadlineAt: localToIso(f.applicationDeadlineAt),
    participantCap: int(f.participantCap),
    waitlistEnabled: f.waitlistEnabled,
    compensationType: f.compensationType,
    productServiceProvided: f.productServiceProvided,
    destinationUrl: f.destinationUrl || undefined,
    conversionSourceType: f.conversionSourceType,
    integrationId: f.integrationId || undefined,
    fulfillmentMode: f.fulfillmentMode,
    locationCountry: f.locationCountry ? f.locationCountry.toUpperCase() : undefined,
    locationCity: f.locationCity || undefined,
    platforms: list(f.platforms),
    discountConfig,
    commission,
    attributionPolicy: { model: f.attributionModel, windowDays: int(f.windowDays) },
    holdPeriodDays: int(f.holdPeriodDays),
    conversionApprovalMode: f.conversionApprovalMode,
    deliverables: f.deliverables.filter((d) => d.type.trim()).map((d) => ({ type: d.type.trim(), description: d.description || undefined, dueDays: int(d.dueDays), required: d.required })),
    contentRights: { ownership: f.ownership, organicAllowed: f.organicAllowed, paidAdsAllowed: f.paidAdsAllowed, whitelistingAllowed: f.whitelistingAllowed, durationDays: int(f.rightsDurationDays) },
    promotionRules: { codeUsageLimit: int(f.codeUsageLimit), codePrefix: f.codePrefix || undefined },
    cancellationRefundPolicy: f.cancellationRefundPolicy || undefined,
    disclosureRequirements: f.disclosureText ? { text: f.disclosureText } : undefined,
    eligibility,
  };
  if (mode === 'create') {
    payload.catalogItemId = f.catalogItemId;
    payload.currency = f.currency;
  }
  return Object.keys(problems).length ? { problems } : { payload, problems };
}

const opt = (entries: Array<[string, string]>) => entries.map(([value, label]) => ({ value, label }));

export function CampaignForm({ businessId, initial, mode, submitLabel, onSubmit, busy, error }: { businessId: string; initial: CampaignFormValue; mode: 'create' | 'edit'; submitLabel: string; onSubmit: (payload: Record<string, unknown>) => void; busy: boolean; error: unknown }) {
  const [f, setF] = useState(initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const catalog = useApi<Array<{ id: string; name: string; active: boolean }>>(`/businesses/${businessId}/catalog?limit=100&active=true`);
  const integrations = useApi<Array<{ id: string; displayName: string; status: string }>>(`/integrations?businessId=${businessId}`);
  const set = <K extends keyof CampaignFormValue>(k: K, v: CampaignFormValue[K]) => setF((x) => ({ ...x, [k]: v }));
  const serverFields = (error as { fieldErrors?: Record<string, string> } | null)?.fieldErrors ?? {};
  const err = (k: string) => problems[k] ?? serverFields[k];
  const text = (k: keyof CampaignFormValue, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <Field label={label} hint={hint} error={err(k)} required={!!props.required}>
      {(p) => <Input {...p} {...props} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} />}
    </Field>
  );
  const select = (k: keyof CampaignFormValue, label: string, options: Array<{ value: string; label: string }>, hint?: string) => (
    <Field label={label} hint={hint} error={err(k)}>
      {(p) => <Select {...p} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} options={options} />}
    </Field>
  );
  const check = (k: keyof CampaignFormValue, label: string) => <Checkbox label={label} checked={f[k] as boolean} onChange={(e) => set(k, e.target.checked as never)} />;
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const r = formToPayload(f, mode);
        setProblems(r.problems);
        if (r.payload) onSubmit(r.payload);
      }}
    >
      <Card title="Basics">
        <div className="grid gap-4 md:grid-cols-2">
          {mode === 'create' && (
            <Field label="Product or service" required error={err('catalogItemId')} hint={catalog.data?.data.length === 0 ? 'Add a product or service first under “Products & services”.' : undefined}>
              {(p) => <Select {...p} value={f.catalogItemId} onChange={(e) => set('catalogItemId', e.target.value)} placeholder="Choose…" options={(catalog.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />}
            </Field>
          )}
          {text('name', 'Campaign name', { required: true, maxLength: 120 })}
          {text('category', 'Category', { required: true }, 'e.g. food, beauty, fitness')}
          {mode === 'create' && select('currency', 'Currency', opt([['JOD', 'JOD'], ['USD', 'USD'], ['AED', 'AED'], ['SAR', 'SAR'], ['EUR', 'EUR']]), 'Fixed for the life of the campaign')}
          <div className="md:col-span-2">
            <Field label="Description" hint="What creators promote, who it is for, and anything they should know (20+ characters to publish)." error={err('description')}>
              {(p) => <Textarea {...p} rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} />}
            </Field>
          </div>
          {select('compensationType', 'Compensation', opt([['commission_only', 'Commission only'], ['gift_commission', 'Product/service + commission']]))}
          <div className="flex items-end pb-2">{check('productServiceProvided', 'Creators receive the product/service')}</div>
        </div>
      </Card>

      <Card title="Where customers buy">
        <div className="grid gap-4 md:grid-cols-2">
          {select('fulfillmentMode', 'Sales channel', opt([['online', 'Online'], ['offline', 'In person'], ['hybrid', 'Online and in person']]))}
          {text('destinationUrl', 'Link where customers buy or book', { type: 'url', placeholder: 'https://' }, 'Must be on your website domain')}
          {select('conversionSourceType', 'How sales are reported', opt([['redemption_interface', 'Staff enter the code at the counter'], ['webhook_api', 'Connected store / website'], ['pos', 'Point of sale'], ['booking_api', 'Booking system'], ['manual_evidence', 'Manual entry with evidence'], ['other', 'Other']]))}
          <Field label="Connected integration (optional)">
            {(p) => <Select {...p} value={f.integrationId} onChange={(e) => set('integrationId', e.target.value)} placeholder="None" options={(integrations.data?.data ?? []).map((i) => ({ value: i.id, label: `${i.displayName} (${i.status})` }))} />}
          </Field>
          {text('locationCountry', 'Country (2-letter code)', { maxLength: 2 })}
          {text('locationCity', 'City')}
          {text('platforms', 'Social platforms', {}, 'Comma-separated, e.g. instagram, tiktok')}
          {text('timezone', 'Time zone', { required: true })}
        </div>
      </Card>

      <Card title="Customer offer">
        <div className="grid gap-4 md:grid-cols-3">
          {select('discountType', 'Discount', opt([['percentage', 'Percentage off'], ['fixed', 'Fixed amount off'], ['other', 'Other offer'], ['none', 'No discount']]))}
          {f.discountType === 'percentage' && text('discountPercent', 'Discount (%)', { inputMode: 'decimal' })}
          {f.discountType === 'fixed' && text('discountAmount', `Discount (${f.currency})`, { inputMode: 'decimal' })}
          {f.discountType !== 'none' && text('discountDescription', 'Offer description', { required: f.discountType === 'other' })}
        </div>
      </Card>

      <Card title="Creator commission" description="Commission is calculated by CODEK from these terms. They are saved into every partnership when it starts.">
        <div className="grid gap-4 md:grid-cols-3">
          {select('commissionType', 'Commission type', opt([['percentage', 'Percentage of sale'], ['fixed', 'Fixed amount per sale']]))}
          {f.commissionType === 'percentage' ? text('commissionPercent', 'Commission (%)', { inputMode: 'decimal', required: true }) : text('commissionFixed', `Per sale (${f.currency})`, { inputMode: 'decimal', required: true })}
          {select('baseType', 'Calculated on', opt([['discounted', 'Price after discount'], ['gross', 'Full price'], ['net', 'Net (after discount, tax and shipping)']]))}
          {text('minAmount', `Minimum per sale (${f.currency})`, { inputMode: 'decimal' })}
          {text('maxAmount', `Maximum per sale (${f.currency})`, { inputMode: 'decimal' })}
          {select('refundBehavior', 'If the customer gets a refund', opt([['reverse', 'Reduce unpaid commission'], ['clawback', 'Reduce commission even after payout'], ['none', 'No change']]))}
          <div className="flex flex-col gap-2 pt-6">{check('includeTax', 'Count tax')}{check('includeShipping', 'Count shipping')}</div>
          {text('holdPeriodDays', 'Hold period (days)', { inputMode: 'numeric', required: true }, 'Days after a sale before it can be paid out (covers refunds)')}
          {select('conversionApprovalMode', 'Approving sales', opt([['manual', 'I approve each sale'], ['auto_verified', 'Automatically approve sales from connected systems']]))}
          {select('attributionModel', 'If several creators touch a sale', opt([['code_first', 'Code used wins'], ['link_first', 'Link clicked wins'], ['last_touch', 'Most recent wins'], ['first_touch', 'First wins']]))}
          {text('windowDays', 'Attribution window (days)', { inputMode: 'numeric' })}
        </div>
      </Card>

      <Card title="Creators, content & rules">
        <div className="grid gap-4 md:grid-cols-3">
          {text('participantCap', 'Maximum creators', { inputMode: 'numeric' }, 'Leave empty for no limit')}
          <div className="flex items-end pb-2">{check('waitlistEnabled', 'Waitlist when full')}</div>
          {text('applicationDeadlineAt', 'Application deadline', { type: 'datetime-local' })}
          {text('startAt', 'Starts', { type: 'datetime-local' })}
          {text('endAt', 'Ends', { type: 'datetime-local' })}
          {text('codeUsageLimit', 'Uses per creator code', { inputMode: 'numeric' }, 'Leave empty for unlimited')}
          {text('codePrefix', 'Code prefix', { maxLength: 8 }, 'Optional, e.g. SUMMER')}
          {text('minFollowers', 'Minimum followers', { inputMode: 'numeric' })}
          {text('minFollowersPlatform', 'On platform (optional)')}
          {text('countries', 'Creator countries', {}, 'Comma-separated codes, e.g. JO, AE')}
          <div className="flex items-end pb-2">{check('verifiedOnly', 'Verified creators only')}</div>
        </div>
        <fieldset className="mt-6 space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Deliverables</legend>
          {f.deliverables.map((d, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_2fr_7rem_auto_auto]">
              <Input aria-label={`Deliverable ${i + 1} type`} value={d.type} onChange={(e) => set('deliverables', f.deliverables.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} placeholder="instagram_post" />
              <Input aria-label={`Deliverable ${i + 1} description`} value={d.description} onChange={(e) => set('deliverables', f.deliverables.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="What to post" />
              <Input aria-label={`Deliverable ${i + 1} due days`} inputMode="numeric" value={d.dueDays} onChange={(e) => set('deliverables', f.deliverables.map((x, j) => (j === i ? { ...x, dueDays: e.target.value } : x)))} placeholder="Due (days)" />
              <Checkbox label="Required" checked={d.required} onChange={(e) => set('deliverables', f.deliverables.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} />
              <Button size="sm" variant="ghost" onClick={() => set('deliverables', f.deliverables.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => set('deliverables', [...f.deliverables, { type: '', description: '', dueDays: '', required: true }])}>Add deliverable</Button>
        </fieldset>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {select('ownership', 'Content owner', opt([['creator', 'Creator'], ['business', 'Business'], ['shared', 'Shared']]))}
          <div className="flex flex-col gap-2 pt-6">{check('organicAllowed', 'Business may repost organically')}{check('paidAdsAllowed', 'Business may use in paid ads')}{check('whitelistingAllowed', 'Whitelisting allowed')}</div>
          {text('rightsDurationDays', 'Usage rights (days)', { inputMode: 'numeric' })}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Disclosure requirement" error={err('disclosureRequirements')}>{(p) => <Textarea {...p} rows={2} value={f.disclosureText} onChange={(e) => set('disclosureText', e.target.value)} />}</Field>
          <Field label="Cancellation & refund policy">{(p) => <Textarea {...p} rows={2} value={f.cancellationRefundPolicy} onChange={(e) => set('cancellationRefundPolicy', e.target.value)} />}</Field>
        </div>
      </Card>

      {Object.keys(problems).length > 0 && <Alert tone="error">Please fix the highlighted fields.</Alert>}
      {!!error && <Alert tone="error">{errorMessage(error)}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
