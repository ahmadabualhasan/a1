'use client';
import { Marketplace } from '@/components/campaigns';

export default function MarketplacePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Open campaigns</h1>
      <p className="mt-2 text-slate-600">Browse campaigns from businesses looking for creators.</p>
      <div className="mt-6">
        <Marketplace detailBase="/campaigns" />
      </div>
    </div>
  );
}
