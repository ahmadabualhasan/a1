'use client';
import Link from 'next/link';
import { use } from 'react';
import { PartnershipView } from '@/components/partnership';

export default function CreatorPartnership({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="space-y-4">
      <Link href="/creator/partnerships" className="text-sm text-brand-700 underline">← All partnerships</Link>
      <PartnershipView id={id} role="creator" />
    </div>
  );
}
