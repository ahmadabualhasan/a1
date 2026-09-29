import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load the repository-root .env for local development (CI/production inject env vars directly).
loadDotenv({ path: path.resolve(__dirname, '../.env'), quiet: true });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
