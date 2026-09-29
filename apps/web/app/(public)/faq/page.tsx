import { Prose } from '@/components/public-shell';

export const metadata = { title: 'FAQ' };

const faqs = [
  ['Does CODEK track every sale?', 'No platform can. Cross-device journeys, browser restrictions and privacy choices can prevent tracking. CODEK relies on verified records from the business’s systems where possible and shows how each sale was credited.'],
  ['Do customers need a CODEK account?', 'No. Customers buy from the business as usual using a creator’s code, link or QR.'],
  ['What happens when an order is refunded?', 'The commission is reduced or reversed automatically according to the partnership terms. If it was already paid, it can be recovered from future earnings when the terms say so.'],
  ['Does CODEK hold my money?', 'Available earnings show what you are owed and can request as a payout. CODEK does not present balances as a wallet or escrow; payouts go through a payout provider.'],
  ['Can campaign changes affect my agreed terms?', 'No. Your terms are saved when the partnership starts. Later campaign edits only apply to new partnerships.'],
];

export default function Page() {
  return (
    <Prose title="Frequently asked questions">
      {faqs.map(([q, a]) => (
        <div key={q}>
          <h2>{q}</h2>
          <p>{a}</p>
        </div>
      ))}
    </Prose>
  );
}
