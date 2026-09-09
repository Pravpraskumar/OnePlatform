import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.PRIME_DATABASE_URL ?? 'postgres://postgres:Justsign@localhost:5432/prime',
  },
});
