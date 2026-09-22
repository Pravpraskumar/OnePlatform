import { config } from 'dotenv';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from './index';

config({ path: resolve(__dirname, '../../../../.env') });

async function main() {
  const url = process.env.CREDITGUARD_DATABASE_URL;
  if (!url) throw new Error('CREDITGUARD_DATABASE_URL is not set');
  const pool = createPool(url);
  const db = createDb(pool);
  console.log('Running CreditGuard database migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
