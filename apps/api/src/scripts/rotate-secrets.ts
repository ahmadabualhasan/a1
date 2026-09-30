import '../env-bootstrap';
import 'reflect-metadata';
import { createApp } from '../app.factory';
import { LocalEncryptedSecretStore } from '../secrets/secret-store';

/**
 * Master-key rotation (docs/RECOVERY.md "Secret rotation"):
 * 1. Generate a new key; deploy with SECRETS_MASTER_KEY=<new> and SECRETS_MASTER_KEY_PREVIOUS=<old>.
 * 2. Run `node dist/scripts/rotate-secrets.js` once — every stored secret is re-encrypted with the new key.
 * 3. When it reports 0 failures, remove SECRETS_MASTER_KEY_PREVIOUS and redeploy; destroy the old key per policy.
 */
async function main(): Promise<void> {
  const app = await createApp();
  try {
    const r = await app.get(LocalEncryptedSecretStore).reencryptAll();
    console.warn(`re-encrypted ${r.reencrypted} secret(s); failed: ${r.failed.length}`);
    if (r.failed.length) {
      console.error(`could not decrypt (check keys): ${r.failed.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
