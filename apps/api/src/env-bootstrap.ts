import path from 'node:path';
import { config } from 'dotenv';

// Must be the first import of every entrypoint: loads the repository .env for local development.
// In staging/production the platform injects environment variables and no .env file exists.
config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
