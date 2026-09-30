'use client';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, DataTable, Field, Input, PageHeader, Select, StatusBadge, Tabs, Textarea } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText, Money } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { toMinorUnits, useApi } from '@/lib/api';
import { percentToRate } from '@/lib/rates';

interface Setting { id: string; key: string; kind: string; valueJson: unknown; environment: string; enabled: boolean; description: string | null; updatedAt: string }
interface Plan { planKey: string; name: string; description: string | null; monthlyPriceMinor: number | null; currency: string | null; fee: string; isDefault: boolean }

function SettingRow({ s }: { s: Setting }) {
  const { run, messages } = useRunner(['/admin/settings']);
  const [value, setValue] = useState(JSON.stringify(s.valueJson));
  const [enabled, setEnabled] = useState(s.enabled);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="grid gap-2 border-b border-slate-100 py-3 md:grid-cols-[16rem_1fr_auto_auto]">
      <div>
        <p className="font-mono text-sm font-medium">{s.key}</p>
        <p className="text-xs text-slate-500">{s.description}</p>
        <p className="text-xs text-slate-400">Updated <DateText value={s.updatedAt} withTime /></p>
      </div>
      <label><span className="sr-only">Value for {s.key}</span><Input className="font-mono" value={value} onChange={(e) => setValue(e.target.value)} /></label>
      <Checkbox label="Enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <ReasonButton
        variant="secondary"
        label="Save"
        title={`Change ${s.key}?`}
        consequence="Settings take effect immediately and are audited."
        onReason={(reason) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(value);
          } catch {
            return setErr('Value must be valid JSON');
          }
          setErr(null);
          return run(`/admin/settings/${encodeURIComponent(s.key)}`, { value: parsed, enabled, reason }, 'Saved.', 'PUT');
        }}
      />
      <div className="md:col-span-4">{err && <Alert tone="error">{err}</Alert>}{messages}</div>
    </div>
  );
}

function Settings() {
  const q = useApi<Setting[]>('/admin/settings');
  return (
    <Card title="Settings & feature flags">
      <QueryView query={q}>{(rows) => <div>{rows.map((s) => <SettingRow key={s.id} s={s} />)}</div>}</QueryView>
    </Card>
  );
}

function Pricing() {
  const q = useApi<Plan[]>('/pricing');
  const { run, messages } = useRunner(['/pricing']);
  const [f, setF] = useState({ planKey: '', name: '', description: '', monthly: '', currency: 'JOD', basis: 'percentage_of_commission', ratePercent: '10' });
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    const rate = f.basis === 'none' ? undefined : percentToRate(f.ratePercent);
    if (f.basis !== 'none' && !rate) return setErr('Enter a fee percentage between 0 and 100');
    const monthlyPriceMinor = f.monthly.trim() ? toMinorUnits(f.monthly, f.currency) : undefined;
    if (monthlyPriceMinor === null) return setErr(`Enter a monthly price in ${f.currency}`);
    setErr(null);
    void run('/admin/pricing-plans', { planKey: f.planKey, name: f.name, description: f.description || undefined, monthlyPriceMinor, currency: monthlyPriceMinor != null ? f.currency : undefined, feePlan: { basis: f.basis, rate } }, 'Plan created.');
  };
  return (
    <div className="space-y-6">
      <Card title="Active plans">
        <QueryView query={q}>
          {(rows) => (
            <DataTable caption="Pricing plans" rowKey={(r) => r.planKey} rows={rows} columns={[
              { key: 'k', header: 'Key', render: (r) => <code>{r.planKey}</code> },
              { key: 'n', header: 'Name', render: (r) => r.name },
              { key: 'm', header: 'Monthly', render: (r) => (r.monthlyPriceMinor ? <Money minor={r.monthlyPriceMinor} currency={r.currency} /> : '—') },
              { key: 'f', header: 'Fee', render: (r) => r.fee },
              { key: 'd', header: 'Default', render: (r) => (r.isDefault ? <StatusBadge status="active" /> : '') },
              { key: 'x', header: '', render: (r) => (!r.isDefault ? <Button size="sm" variant="secondary" onClick={() => run(`/admin/pricing-plans/${r.planKey}/active`, { active: false }, 'Deactivated.')}>Deactivate</Button> : null) },
            ]} />
          )}
        </QueryView>
      </Card>
      <Card title="New plan" description="Fee changes apply to partnerships created after the change; existing partnerships keep their saved fee plan.">
        <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Plan key">{(p) => <Input {...p} value={f.planKey} onChange={(e) => setF({ ...f, planKey: e.target.value })} />}</Field>
          <Field label="Name">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Monthly price (optional)">{(p) => <Input {...p} inputMode="decimal" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} />}</Field>
          <Field label="Fee basis">{(p) => <Select {...p} value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} options={[{ value: 'none', label: 'No fee' }, { value: 'percentage_of_commission', label: '% of creator commission' }, { value: 'percentage_of_sale', label: '% of attributed sale' }]} />}</Field>
          {f.basis !== 'none' && <Field label="Fee (%)">{(p) => <Input {...p} inputMode="decimal" value={f.ratePercent} onChange={(e) => setF({ ...f, ratePercent: e.target.value })} />}</Field>}
          <Field label="Currency">{(p) => <Input {...p} maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />}</Field>
          <div className="md:col-span-3"><Field label="Description">{(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field></div>
          <div><Button type="submit">Create plan</Button></div>
        </form>
        <div className="mt-3">{err && <Alert tone="error">{err}</Alert>}{messages}</div>
      </Card>
    </div>
  );
}

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings & pricing" />
      <Tabs tabs={[{ id: 's', label: 'Settings', content: <Settings /> }, { id: 'p', label: 'Pricing plans', content: <Pricing /> }]} />
    </div>
  );
}
