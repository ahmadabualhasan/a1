'use client';
import Link from 'next/link';
import { use } from 'react';
import { CampaignDetailView } from '@/components/campaigns';

export default function CreatorCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="space-y-4">
      <Link href="/creator/marketplace" className="text-sm text-brand-700 underline">← Back to campaigns</Link>
      <CampaignDetailView id={id} />
    </div>
  );
}
