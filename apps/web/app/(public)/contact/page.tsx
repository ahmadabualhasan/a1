import { Prose } from '@/components/public-shell';

export const metadata = { title: 'Contact' };

export default function Page() {
  return (
    <Prose title="Contact us" intro="Questions about CODEK, partnerships or your account?">
      <p>Signed-in users can reach support from their account. For privacy requests (access, correction, deletion), use Account → Privacy after signing in.</p>
    </Prose>
  );
}
