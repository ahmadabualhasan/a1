import Link from 'next/link';
import { Prose } from '@/components/public-shell';

export const metadata = { title: 'For businesses' };

export default function Page() {
  return (
    <Prose title="Grow sales with creators — pay only for verified results" intro="Online shops, restaurants, salons, clinics, gyms and more.">
      <ul>
        <li>Create campaigns for any product or service, online or in-store.</li>
        <li>Review creator applications with real performance history, not just follower counts.</li>
        <li>Connect your store or POS, or record in-store redemptions with a simple screen.</li>
        <li>See sales, commissions and fees clearly — and what still needs funding.</li>
        <li>Refunds and cancellations adjust commissions automatically.</li>
      </ul>
      <p>
        <Link className="font-medium text-brand-700 underline" href="/sign-up?role=business">
          Create a business account
        </Link>
      </p>
    </Prose>
  );
}
