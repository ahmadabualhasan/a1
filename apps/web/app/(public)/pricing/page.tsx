'use client';
import { Card, Grid } from '@codek/ui';
import { Money } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface Plan {
  planKey: string;
  name: string;
  description: string | null;
  monthlyPriceMinor: number | null;
  currency: string | null;
  fee: string;
}

export default function PricingPage() {
  const q = useApi<Plan[]>('/pricing');
  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="text-3xl font-bold text-slate-900">Pricing</h1>
      <p className="mt-2 text-slate-600">Prices and fees are shown before you commit. Fees that apply to a partnership are saved with its terms.</p>
      <div className="mt-8">
        <QueryView query={q}>
          {(plans) => (
            <Grid cols={3}>
              {plans.map((p) => (
                <Card key={p.planKey} title={p.name} description={p.description ?? undefined}>
                  <p className="text-2xl font-semibold">{p.monthlyPriceMinor ? <Money minor={p.monthlyPriceMinor} currency={p.currency} /> : 'No subscription fee'}</p>
                  <p className="mt-2 text-sm text-slate-600">{p.fee}</p>
                </Card>
              ))}
            </Grid>
          )}
        </QueryView>
      </div>
    </div>
  );
}
