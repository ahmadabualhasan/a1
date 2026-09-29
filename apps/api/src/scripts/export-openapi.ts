import '../env-bootstrap';
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApi, createApp } from '../app.factory';

/** Writes the OpenAPI contract used for docs and typed client generation (packages/api-client/openapi.json). */
async function main(): Promise<void> {
  const app = await createApp();
  const doc = buildOpenApi(app);
  const out = path.resolve(__dirname, '../../../../packages/api-client/openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  await app.close();
  console.warn(`OpenAPI written: ${out} (${Object.keys(doc.paths).length} paths)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
