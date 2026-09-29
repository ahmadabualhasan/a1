'use client';
import { useRouter } from 'next/navigation';
import { LoadingState, PageHeader } from '@codek/ui';
import { CampaignForm, EMPTY_CAMPAIGN } from '@/components/campaign-form';
import { useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function NewCampaign() {
  const router = useRouter();
  const { businessId } = useSession();
  const create = useApiMutation<Record<string, unknown>, { id: string }>('POST', `/businesses/${businessId}/campaigns`, {
    invalidate: [`/businesses/${businessId}/campaigns`],
    onSuccess: (c) => router.push(`/business/campaigns/${c.id}`),
  });
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="New campaign" description="Saved as a draft. You can review everything before publishing." />
      <CampaignForm businessId={businessId} initial={EMPTY_CAMPAIGN} mode="create" submitLabel="Save draft" onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error} />
    </div>
  );
}
