import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Client } from 'pg';

config({ path: resolve(__dirname, '../../../../.env') });

async function main() {
  if (process.env.DB_RESET_CONFIRM !== 'YES') {
    throw new Error('Refusing to reset the database. Set DB_RESET_CONFIRM=YES to continue.');
  }
  const url = process.env.PRIME_DATABASE_URL;
  if (!url) throw new Error('PRIME_DATABASE_URL is not set');

  const client = new Client({ connectionString: url });
  await client.connect();
  console.log('Resetting PRIME database schema...');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;');
  await client.end();
  console.log('PRIME database reset complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
