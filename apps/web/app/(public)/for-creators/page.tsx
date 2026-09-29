import Link from 'next/link';
import { Prose } from '@/components/public-shell';

export const metadata = { title: 'For creators' };

export default function Page() {
  return (
    <Prose title="Earn from the brands you already love" intro="Find campaigns, get your own code, link and QR, and track what you earn.">
      <ul>
        <li>Browse campaigns by category, city, platform and commission.</li>
        <li>Every term — commission, discount, content rights — is shown before you apply and saved when you are accepted.</li>
        <li>See your sales and earnings as pending, approved, available and paid.</li>
        <li>Request payouts once your earnings are available.</li>
      </ul>
      <p>
        <Link className="font-medium text-brand-700 underline" href="/sign-up?role=creator">
          Join as a creator
        </Link>
      </p>
    </Prose>
  );
}
