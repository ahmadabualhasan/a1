'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, EmptyState, PageHeader, StatusBadge } from '@codek/ui';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface AssetGroup {
  partnershipId: string;
  partnershipStatus: string;
  campaign: { id: string; name: string; status: string; endAt: string | null; disclosureRequirements: { text?: string } | null };
  business: { displayName: string };
  codes: Array<{ id: string; code: string; status: string; startsAt: string | null; expiresAt: string | null; usageLimit: number | null; usageCount: number }>;
  links: Array<{ id: string; status: string; url: string }>;
  qrCodes: Array<{ id: string; status: string; downloadUrl: string }>;
}

export default function CreatorAssets() {
  const q = useApi<AssetGroup[]>('/creator/promotion-assets');
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (v: string) => {
    await navigator.clipboard?.writeText(v).catch(() => undefined);
    setCopied(v);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Codes, links & QR" description="Share the link online and the code or QR code in person. Always follow each campaign's disclosure rules." />
      <QueryView query={q} empty={<EmptyState title="No promotion assets yet" description="You get a unique code, link and QR when a partnership starts." />}>
        {(groups) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <Card key={g.partnershipId} title={g.campaign.name} description={g.business.displayName} actions={<StatusBadge status={g.partnershipStatus} />}>
                <div className="space-y-3">
                  {g.codes.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-base font-semibold tracking-wider">{c.code}</span>
                      <StatusBadge status={c.status} />
                      <span className="text-xs text-slate-500">{c.usageCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ''} uses{c.expiresAt ? <> · expires <DateText value={c.expiresAt} /></> : null}</span>
                      <Button size="sm" variant="secondary" onClick={() => copy(c.code)}>{copied === c.code ? 'Copied' : 'Copy'}</Button>
                    </div>
                  ))}
                  {g.links.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-2">
                      <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs">{l.url}</code>
                      <Button size="sm" variant="secondary" onClick={() => copy(l.url)}>{copied === l.url ? 'Copied' : 'Copy link'}</Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-3 text-sm">
                    {g.qrCodes.map((qr) => (
                      <a key={qr.id} className="font-medium text-brand-700 underline" href={qr.downloadUrl}>Download QR (PNG)</a>
                    ))}
                    <Link className="text-slate-600 underline" href={`/creator/partnerships/${g.partnershipId}`}>Partnership details</Link>
                  </div>
                  {g.campaign.disclosureRequirements?.text && <p className="text-xs text-slate-500">Disclosure: {g.campaign.disclosureRequirements.text}</p>}
                  {g.partnershipStatus !== 'active' && <p className="text-xs text-amber-700">This partnership is not active, so the code and link do not earn commission right now.</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}
