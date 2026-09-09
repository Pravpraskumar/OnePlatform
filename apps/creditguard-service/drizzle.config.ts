import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CREDITGUARD_DATABASE_URL ?? 'postgres://postgres:Justsign@localhost:5432/creditguard',
  },
});
