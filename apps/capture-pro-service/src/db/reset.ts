import { config } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../../.env') });

async function main() {
  if (process.env.DB_RESET_CONFIRM !== 'YES') throw new Error('Set DB_RESET_CONFIRM=YES to reset Capture-Pro');
  const client = new Client({ connectionString: process.env.CAPTUREPRO_DATABASE_URL });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();
}

void main();