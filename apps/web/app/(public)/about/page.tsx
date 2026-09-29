import { Prose } from '@/components/public-shell';

export const metadata = { title: 'About' };

export default function Page() {
  return (
    <Prose title="About CODEK" intro="Infrastructure for creator–business partnerships.">
      <p>CODEK combines a partnership marketplace with attribution, commission calculation, a financial ledger, payouts and reconciliation — for online and offline businesses across industries.</p>
      <p>Codes, links and creator marketplaces exist elsewhere; our focus is making the whole chain from partnership to payout accurate, auditable and simple to use.</p>
    </Prose>
  );
}
