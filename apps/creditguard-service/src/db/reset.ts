import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Client } from 'pg';

config({ path: resolve(__dirname, '../../../../.env') });

async function main() {
  if (process.env.DB_RESET_CONFIRM !== 'YES') {
    throw new Error('Refusing to reset the database. Set DB_RESET_CONFIRM=YES to continue.');
  }
  const url = process.env.CREDITGUARD_DATABASE_URL;
  if (!url) throw new Error('CREDITGUARD_DATABASE_URL is not set');

  const client = new Client({ connectionString: url });
  await client.connect();
  console.log('Resetting CreditGuard database schema...');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
  console.log('CreditGuard database reset complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
