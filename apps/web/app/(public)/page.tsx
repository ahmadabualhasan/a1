import Link from 'next/link';

const steps = [
  { t: 'Businesses publish a campaign', d: 'Pick a product or service, set the customer discount and the creator commission. Terms are frozen for every partnership.' },
  { t: 'Creators apply or get invited', d: 'Accepted creators receive a unique code, a referral link and a QR code for online and in-store sales.' },
  { t: 'Sales are verified', d: 'Orders come from your store, POS or booking system — or from CODEK’s in-store redemption screen. Clicks alone never create commission.' },
  { t: 'Everyone gets paid correctly', d: 'Commissions follow the agreed terms, refunds adjust them automatically, and every amount is recorded in a double-entry ledger.' },
];

export default function Home() {
  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Creator partnerships that pay on verified sales</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            CODEK connects businesses with creators, tracks codes, links and QR — online and offline — and turns verified sales into accurate commissions and payouts.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/sign-up?role=business" className="rounded-lg bg-brand-600 px-5 py-3 font-medium text-white hover:bg-brand-700">
              I’m a business
            </Link>
            <Link href="/sign-up?role=creator" className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-800 hover:bg-slate-50">
              I’m a creator
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold text-slate-900">How CODEK works</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.t} className="rounded-xl border border-slate-200 p-5">
              <span className="text-sm font-semibold text-brand-600">Step {i + 1}</span>
              <h3 className="mt-2 font-semibold text-slate-900">{s.t}</h3>
              <p className="mt-2 text-sm text-slate-600">{s.d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Honest tracking: no platform can attribute every sale (for example across devices or when privacy settings block tracking). CODEK prefers
          verified records from your own systems and shows exactly how each sale was credited.
        </p>
      </section>
    </>
  );
}
