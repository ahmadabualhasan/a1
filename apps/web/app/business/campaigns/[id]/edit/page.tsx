'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { Alert, LoadingState, PageHeader } from '@codek/ui';
import { CampaignForm, campaignToForm, type MemberCampaign } from '@/components/campaign-form';
import { QueryView } from '@/components/query-view';
import { useApi, useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function EditCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { businessId } = useSession();
  const q = useApi<MemberCampaign>(`/campaigns/${id}`);
  const save = useApiMutation<Record<string, unknown>>('PATCH', `/campaigns/${id}`, { invalidate: [`/campaigns/${id}`, `/businesses/${businessId}/campaigns`], onSuccess: () => router.push(`/business/campaigns/${id}`) });
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <Link href={`/business/campaigns/${id}`} className="text-sm text-brand-700 underline">← Back to campaign</Link>
      <QueryView query={q}>
        {(c) => (
          <>
            <PageHeader title={`Edit ${c.name}`} />
            {['active', 'published', 'paused'].includes(c.status) && (
              <Alert tone="warning">Changes to commission, discount or attribution apply to new partnerships only. Existing partnerships keep their saved terms; creators who applied under older terms must re-confirm.</Alert>
            )}
            <CampaignForm businessId={businessId} initial={campaignToForm(c)} mode="edit" submitLabel="Save changes" onSubmit={(p) => save.mutate({ ...p, version: c.version })} busy={save.isPending} error={save.error} />
          </>
        )}
      </QueryView>
    </div>
  );
}
