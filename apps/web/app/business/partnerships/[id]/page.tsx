'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, ConfirmButton } from '@codek/ui';
import { PartnershipView, type PartnershipDetail } from '@/components/partnership';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

function Actions({ p }: { p: PartnershipDetail }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const [err, setErr] = useState<string | null>(null);
  if (!can('partnership.manage')) return null;
  const run = async (path: string, body: Record<string, unknown>) => {
    setErr(null);
    try {
      await api(path, { method: 'POST', json: body });
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/partnerships') });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const code = p.promotionCodes[0];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {p.status === 'active' && <ConfirmButton variant="secondary" label="Pause" title="Pause this partnership?" consequence="The creator’s code and link stop earning commission until you resume." confirmLabel="Pause" requireReason onConfirm={(reason) => run(`/partnerships/${p.id}/pause`, { reason })} />}
      {p.status === 'paused' && <Button size="sm" onClick={() => run(`/partnerships/${p.id}/resume`, { reason: 'Resumed by business' })}>Resume</Button>}
      {['active', 'paused'].includes(p.status) && <ConfirmButton variant="secondary" label="Complete" title="Mark as completed?" consequence="The code and link stop working. Commissions already earned stay payable." confirmLabel="Complete" requireReason onConfirm={(reason) => run(`/partnerships/${p.id}/complete`, { reason })} />}
      {['active', 'paused', 'disputed'].includes(p.status) && <ConfirmButton label="Terminate" title="Terminate this partnership?" consequence="Use this for policy violations. The code and link stop working immediately. Earned commissions are handled according to the saved terms and any open dispute." confirmLabel="Terminate" requireReason onConfirm={(reason) => run(`/partnerships/${p.id}/terminate`, { reason })} />}
      {code && code.status === 'active' && <ConfirmButton variant="secondary" label="Pause code" title={`Pause code ${code.code}?`} consequence="Customers can no longer use this code until you resume it." confirmLabel="Pause code" requireReason onConfirm={(reason) => run(`/promotion-codes/${code.id}/pause`, { reason })} />}
      {code && code.status === 'paused' && <Button size="sm" variant="secondary" onClick={() => run(`/promotion-codes/${code.id}/resume`, { reason: 'Resumed by business' })}>Resume code</Button>}
      {code && ['active', 'paused'].includes(code.status) && <ConfirmButton label="Revoke code" title={`Revoke code ${code.code}?`} consequence="The code stops working permanently." confirmLabel="Revoke" requireReason onConfirm={(reason) => run(`/promotion-codes/${code.id}/revoke`, { reason })} />}
      {err && <Alert tone="error">{err}</Alert>}
    </div>
  );
}

export default function BusinessPartnership({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="space-y-4">
      <Link href="/business/partnerships" className="text-sm text-brand-700 underline">← All partnerships</Link>
      <PartnershipView id={id} role="business" extraActions={(p) => <Actions p={p} />} />
      <Link href={`/business/sales?partnershipId=${id}`} className="text-sm text-brand-700 underline">Sales for this partnership</Link>
    </div>
  );
}
