'use client';
import { DataTable, EmptyState, PageHeader } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface Report { id: string; reason: string; createdAt: string; reporterUserId: string; message: { id: string; body: string | null; messageType: string; createdAt: string; senderUserId: string; hiddenAt: string | null } }

export default function Moderation() {
  const q = useApi<Report[]>('/admin/moderation/message-reports');
  const { run, messages } = useRunner(['/admin/moderation']);
  return (
    <div className="space-y-6">
      <PageHeader title="Message moderation" description="Hidden messages are kept for evidence and audit; they are not deleted." />
      {messages}
      <QueryView query={q} empty={<EmptyState title="No open reports" />}>
        {(rows) => (
          <DataTable caption="Reported messages" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'd', header: 'Reported', render: (r) => <DateText value={r.createdAt} withTime /> },
            { key: 'r', header: 'Reason', className: 'whitespace-normal max-w-xs', render: (r) => r.reason },
            { key: 'm', header: 'Message', className: 'whitespace-normal max-w-md', render: (r) => <span>{r.message.body ?? `[${r.message.messageType}]`}{r.message.hiddenAt && <span className="ml-1 text-xs text-slate-500">(hidden)</span>}</span> },
            { key: 'a', header: '', render: (r) => (
              <span className="flex gap-1">
                <ReasonButton label="Hide" title="Hide this message?" consequence="Participants no longer see it. The original is kept for audit." onReason={(note) => run(`/admin/moderation/messages/${r.message.id}`, { action: 'hide', note }, 'Hidden.')} />
                <ReasonButton variant="secondary" label="Dismiss" title="Dismiss the report?" consequence="The message stays visible." onReason={(note) => run(`/admin/moderation/messages/${r.message.id}`, { action: 'dismiss', note }, 'Dismissed.')} />
              </span>
            ) },
          ]} />
        )}
      </QueryView>
    </div>
  );
}
