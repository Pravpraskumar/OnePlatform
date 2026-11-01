import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CAPTUREPRO_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/capturepro',
  },
});