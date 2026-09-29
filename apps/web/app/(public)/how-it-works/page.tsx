import { Prose } from '@/components/public-shell';

export const metadata = { title: 'How it works' };

export default function Page() {
  return (
    <Prose title="How CODEK works" intro="From campaign to payout, in plain steps.">
      <h2>1. Campaigns with clear terms</h2>
      <p>A business describes the product or service, the customer discount, the creator commission and how it is calculated, content requirements, content rights and the hold period before commissions become payable.</p>
      <h2>2. Partnerships</h2>
      <p>When a business accepts a creator (or a creator accepts an invitation), CODEK creates a partnership and saves a copy of the agreed terms. Later campaign edits never change terms already agreed.</p>
      <h2>3. Codes, links and QR</h2>
      <p>Each partnership gets a unique promotion code, a referral link that only leads to the business’s approved website, and a QR code for offline use.</p>
      <h2>4. Verified sales</h2>
      <p>Sales are confirmed by the business’s system (online store, POS, booking) or by the business in CODEK’s redemption screen. When a link and a code point to different creators, the campaign’s attribution rule decides and the decision is recorded.</p>
      <h2>5. Commissions and payouts</h2>
      <p>Commissions are calculated from the saved terms, adjusted automatically for refunds, funded by the business, and paid out through a payout provider. Available earnings are what you are owed — CODEK does not present them as a wallet or escrow.</p>
    </Prose>
  );
}
