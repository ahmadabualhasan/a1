'use client';
import { PageHeader } from '@codek/ui';
import { Marketplace } from '@/components/campaigns';

export default function CreatorMarketplace() {
  return (
    <div className="space-y-6">
      <PageHeader title="Find campaigns" description="Campaigns from businesses looking for creators. Filter by category, location, platform and commission." />
      <Marketplace detailBase="/creator/marketplace" />
    </div>
  );
}
