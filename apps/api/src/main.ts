import './env-bootstrap';
import 'reflect-metadata';
import { loadEnv } from '@codek/config';
import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.API_PORT);
}

bootstrap().catch((err) => {
  console.error('CODEK API failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
