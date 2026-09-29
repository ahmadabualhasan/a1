'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatMoney, formatRate } from '@codek/api-client';
import { Alert, Badge, Button, Card, DescriptionList, EmptyState, Field, Grid, Input, Select, Textarea } from '@codek/ui';
import { Money, DateText } from './format';
import { QueryView } from './query-view';
import { errorMessage, useApi, useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

export interface CampaignCard {
  id: string;
  name: string;
  category: string;
  business: { id: string; displayName: string; verificationStatus: string; city: string | null; country: string };
  productName: string;
  priceMinor: number | null;
  priceCurrency: string | null;
  currency: string;
  customerDiscount: { type: string; rate?: string; amountMinor?: number; description?: string };
  creatorCommission: { type: string; rate: string | null; fixedMinor: number | null; baseType: string } | null;
  compensationType: string;
  productServiceProvided: boolean;
  durationDays: number | null;
  location: { country: string | null; city: string | null };
  fulfillmentMode: string;
  platforms: string[];
  spotsLeft: number | null;
  applicationDeadlineAt: string | null;
  waitlistEnabled: boolean;
  applicationsOpen: boolean;
  status: string;
}

export function discountText(d: CampaignCard['customerDiscount'], currency: string): string {
  if (d.type === 'percentage') return `${formatRate(d.rate)} off for customers`;
  if (d.type === 'fixed') return `${formatMoney(d.amountMinor, currency)} off for customers`;
  if (d.type === 'other') return d.description ?? 'Special offer';
  return 'No customer discount';
}

export function commissionText(c: CampaignCard['creatorCommission'], currency: string) {
  if (!c) return '—';
  const base = { gross: 'of the order value', discounted: 'of the discounted order value', net: 'of the net order value' }[c.baseType] ?? '';
  return c.type === 'percentage' ? `${formatRate(c.rate)} ${base}` : <><Money minor={c.fixedMinor} currency={currency} /> per sale</>;
}

const COMPENSATION: Record<string, string> = { commission_only: 'Commission only', gift_commission: 'Product/service + commission', fixed_fee_commission: 'Fixed fee + commission', paid_content: 'Paid content' };

export function CampaignCardView({ c, href }: { c: CampaignCard; href: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.business.displayName}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{c.name}</h3>
          <p className="text-sm text-slate-600">{c.productName}</p>
        </div>
        {c.business.verificationStatus === 'verified' && <Badge tone="green">Verified business</Badge>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-slate-500">Creator commission</dt><dd className="font-medium">{commissionText(c.creatorCommission, c.currency)}</dd></div>
        <div><dt className="text-xs text-slate-500">Customer offer</dt><dd>{discountText(c.customerDiscount, c.currency)}</dd></div>
        <div><dt className="text-xs text-slate-500">Type</dt><dd>{COMPENSATION[c.compensationType] ?? c.compensationType}</dd></div>
        <div><dt className="text-xs text-slate-500">Where</dt><dd>{[c.location.city, c.location.country].filter(Boolean).join(', ') || 'Online'} · {c.fulfillmentMode}</dd></div>
        <div><dt className="text-xs text-slate-500">Price</dt><dd>{c.priceMinor != null ? <Money minor={c.priceMinor} currency={c.priceCurrency} /> : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Spots</dt><dd>{c.spotsLeft == null ? 'Open' : c.spotsLeft > 0 ? `${c.spotsLeft} left` : c.waitlistEnabled ? 'Waitlist' : 'Full'}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1">
        {c.platforms.map((p) => (
          <Badge key={p} tone="blue">{p}</Badge>
        ))}
        {c.durationDays != null && <Badge>{c.durationDays} days</Badge>}
      </div>
    </Link>
  );
}

export function Marketplace({ detailBase }: { detailBase: string }) {
  const [f, setF] = useState({ q: '', category: '', city: '', platform: '', fulfillmentMode: '', compensationType: '', hasDiscount: '', productServiceProvided: '', minCommissionRate: '' });
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as Array<[string, string]>);
  params.set('limit', '50');
  const q = useApi<CampaignCard[]>(`/marketplace/campaigns?${params.toString()}`);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-6">
      <form role="search" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()}>
        <Field label="Search">{(p) => <Input {...p} value={f.q} onChange={set('q')} placeholder="Product, brand…" />}</Field>
        <Field label="Category">{(p) => <Input {...p} value={f.category} onChange={set('category')} placeholder="e.g. beauty" />}</Field>
        <Field label="City">{(p) => <Input {...p} value={f.city} onChange={set('city')} />}</Field>
        <Field label="Platform">{(p) => <Select {...p} value={f.platform} onChange={set('platform')} placeholder="Any" options={['instagram', 'tiktok', 'youtube', 'snapchat', 'x', 'facebook'].map((v) => ({ value: v, label: v }))} />}</Field>
        <Field label="Online / offline">{(p) => <Select {...p} value={f.fulfillmentMode} onChange={set('fulfillmentMode')} placeholder="Any" options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'In-store' }, { value: 'hybrid', label: 'Both' }]} />}</Field>
        <Field label="Compensation">{(p) => <Select {...p} value={f.compensationType} onChange={set('compensationType')} placeholder="Any" options={Object.entries(COMPENSATION).map(([value, label]) => ({ value, label }))} />}</Field>
        <Field label="Customer discount">{(p) => <Select {...p} value={f.hasDiscount} onChange={set('hasDiscount')} placeholder="Any" options={[{ value: 'true', label: 'With discount' }, { value: 'false', label: 'No discount' }]} />}</Field>
        <Field label="Product provided">{(p) => <Select {...p} value={f.productServiceProvided} onChange={set('productServiceProvided')} placeholder="Any" options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />}</Field>
        <Field label="Min. commission" hint="e.g. 0.10 for 10%">{(p) => <Input {...p} value={f.minCommissionRate} onChange={set('minCommissionRate')} inputMode="decimal" />}</Field>
      </form>
      <QueryView query={q} empty={<EmptyState title="No campaigns match your filters" description="Try removing a filter or check back soon." />}>
        {(items) => (
          <Grid cols={3}>
            {items.map((c) => (
              <CampaignCardView key={c.id} c={c} href={`${detailBase}/${c.id}`} />
            ))}
          </Grid>
        )}
      </QueryView>
    </div>
  );
}

interface CampaignDetail extends CampaignCard {
  description: string | null;
  catalogItem: { name: string; type: string; description: string | null };
  commissionTerms: { type: string; rate: string | null; fixedMinor: number | null; currency: string | null; baseType: string; includeTax: boolean; includeShipping: boolean; minMinor: number | null; maxMinor: number | null; refundBehavior: string } | null;
  attribution: { model: string; windowDays: number; note: string };
  holdPeriodDays: number;
  deliverables: Array<{ type: string; description?: string; dueDays?: number; required: boolean }> | null;
  contentRights: { ownership: string; organicAllowed: boolean; paidAdsAllowed: boolean; whitelistingAllowed: boolean; durationDays?: number; territory?: string } | null;
  promotionRules: { perCustomerLimit?: number; codeUsageLimit?: number; stackable?: boolean } | null;
  cancellationRefund: { policy?: string } | null;
  disclosureRequirements: { text?: string } | null;
  eligibility: Array<{ ruleType: string; value: Record<string, unknown> }>;
  startAt: string | null;
  endAt: string | null;
}

const MODEL: Record<string, string> = { code_first: 'The creator whose code is used gets the sale', link_first: 'The creator whose link was clicked gets the sale', last_touch: 'The most recent creator touch gets the sale', first_touch: 'The first creator touch gets the sale' };
const REFUND: Record<string, string> = { reverse: 'Refunds before payout reduce the commission', clawback: 'Refunds reduce the commission, even after payout (recovered from future earnings)', none: 'Refunds do not change the commission' };

export function CampaignDetailView({ id }: { id: string }) {
  const q = useApi<CampaignDetail>(`/campaigns/${id}`);
  const { session } = useSession();
  const [message, setMessage] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const apply = useApiMutation<{ message?: string }, { status: string }>('POST', `/campaigns/${id}/apply`, { invalidate: ['/creator/applications'], onSuccess: (r) => setDone(r.status) });
  return (
    <QueryView query={q}>
      {(c) => (
        <div className="space-y-6">
          <div>
            <p className="text-sm text-slate-500">{c.business.displayName}</p>
            <h1 className="text-2xl font-semibold text-slate-900">{c.name}</h1>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-slate-600">{c.description}</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="What you promote">
                <DescriptionList items={[
                  { label: 'Product / service', value: c.catalogItem.name },
                  { label: 'Price', value: c.priceMinor != null ? <Money minor={c.priceMinor} currency={c.priceCurrency} /> : '—' },
                  { label: 'Customer offer', value: discountText(c.customerDiscount, c.currency) },
                  { label: 'Product provided to you', value: c.productServiceProvided ? 'Yes' : 'No' },
                  { label: 'Campaign dates', value: <><DateText value={c.startAt} /> – <DateText value={c.endAt} /></> },
                  { label: 'Where', value: [c.location.city, c.location.country].filter(Boolean).join(', ') || 'Online' },
                ]} />
              </Card>
              <Card title="How you earn">
                {c.commissionTerms && (
                  <DescriptionList items={[
                    { label: 'Commission', value: commissionText(c.creatorCommission, c.currency) },
                    { label: 'Tax / shipping counted', value: `${c.commissionTerms.includeTax ? 'Tax included' : 'Tax excluded'}, ${c.commissionTerms.includeShipping ? 'shipping included' : 'shipping excluded'}` },
                    { label: 'Minimum / maximum per sale', value: c.commissionTerms.minMinor || c.commissionTerms.maxMinor ? <><Money minor={c.commissionTerms.minMinor} currency={c.currency} /> / <Money minor={c.commissionTerms.maxMinor} currency={c.currency} /></> : 'None' },
                    { label: 'Hold period', value: `${c.holdPeriodDays} days after the sale before it can be paid out` },
                    { label: 'Refunds', value: REFUND[c.commissionTerms.refundBehavior] },
                    { label: 'Which creator gets the sale', value: `${MODEL[c.attribution.model] ?? c.attribution.model} (${c.attribution.windowDays}-day window)` },
                  ]} />
                )}
                <p className="mt-4 text-xs text-slate-500">{c.attribution.note}</p>
              </Card>
              <Card title="Content & rights">
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {(c.deliverables ?? []).map((d, i) => (
                    <li key={i}>{d.type.replace(/_/g, ' ')}{d.description ? ` — ${d.description}` : ''}{d.dueDays != null ? ` (within ${d.dueDays} days)` : ''}{d.required ? '' : ' (optional)'}</li>
                  ))}
                  {!c.deliverables?.length && <li>No specific deliverables</li>}
                </ul>
                {c.contentRights && (
                  <p className="mt-3 text-sm text-slate-700">
                    Content owner: {c.contentRights.ownership}. Organic reuse {c.contentRights.organicAllowed ? 'allowed' : 'not allowed'}, paid ads {c.contentRights.paidAdsAllowed ? 'allowed' : 'not allowed'}, whitelisting {c.contentRights.whitelistingAllowed ? 'allowed' : 'not allowed'}
                    {c.contentRights.durationDays ? ` for ${c.contentRights.durationDays} days` : ''}{c.contentRights.territory ? ` in ${c.contentRights.territory}` : ''}.
                  </p>
                )}
                {c.disclosureRequirements?.text && <p className="mt-3 text-sm text-slate-700">Disclosure: {c.disclosureRequirements.text}</p>}
                {c.cancellationRefund?.policy && <p className="mt-3 text-sm text-slate-700">Cancellations & refunds: {c.cancellationRefund.policy}</p>}
              </Card>
            </div>
            <div className="space-y-6">
              <Card title="Apply">
                {c.eligibility.length > 0 && (
                  <ul className="mb-3 list-disc pl-5 text-sm text-slate-600">
                    {c.eligibility.map((e, i) => (
                      <li key={i}>{e.ruleType === 'min_followers' ? `At least ${String(e.value.count)} followers${e.value.platform ? ` on ${String(e.value.platform)}` : ''}` : e.ruleType === 'country' ? `Based in ${(e.value.countries as string[]).join(', ')}` : e.ruleType === 'verified_only' ? 'Verified creators only' : `Category: ${(e.value.categories as string[]).join(', ')}`}</li>
                    ))}
                  </ul>
                )}
                {!c.applicationsOpen ? (
                  <Alert tone="warning">Applications are closed for this campaign.</Alert>
                ) : !session ? (
                  <Link href={`/sign-in?next=/creator/marketplace/${c.id}`} className="font-medium text-brand-700 underline">Sign in as a creator to apply</Link>
                ) : session.user.accountType !== 'creator' ? (
                  <p className="text-sm text-slate-600">Only creator accounts can apply.</p>
                ) : done ? (
                  <Alert tone="success">{done === 'waitlisted' ? 'You are on the waitlist. The business will contact you if a spot opens.' : 'Application sent! You will be notified when the business responds.'}</Alert>
                ) : (
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); apply.mutate({ message: message || undefined }); }}>
                    <Field label="Message to the business" hint="Why are you a good fit? (optional)">{(p) => <Textarea {...p} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />}</Field>
                    {apply.error && <Alert tone="error">{errorMessage(apply.error)}</Alert>}
                    <Button type="submit" loading={apply.isPending}>Apply to this campaign</Button>
                  </form>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </QueryView>
  );
}
