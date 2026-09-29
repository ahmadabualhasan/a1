import { Prose } from '@/components/public-shell';

export const metadata = { title: 'Resources' };

export default function Page() {
  return (
    <Prose title="Resources" intro="Guides for getting started.">
      <h2>For businesses</h2>
      <ul>
        <li>Setting commission terms: choose the base (before or after discount), whether tax and shipping count, and a hold period.</li>
        <li>Connecting your store: use the Shopify connector or send signed events from your website, app or POS.</li>
        <li>Recording in-store sales: use the redemption screen with the customer’s code and your receipt number.</li>
      </ul>
      <h2>For creators</h2>
      <ul>
        <li>Disclose partnerships as required where you publish.</li>
        <li>Share your link for online sales and your code or QR for in-store purchases.</li>
      </ul>
    </Prose>
  );
}
