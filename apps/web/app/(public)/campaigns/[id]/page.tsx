'use client';
import { use } from 'react';
import { CampaignDetailView } from '@/components/campaigns';

export default function PublicCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <CampaignDetailView id={id} />
    </div>
  );
}
