import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { createDb, createPool } from './index';

config({ path: resolve(__dirname, '../../../../.env') });

async function main() {
  const pool = createPool(process.env.CAPTUREPRO_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/capturepro');
  await migrate(createDb(pool), { migrationsFolder: resolve(__dirname, '../../drizzle') });
  await pool.end();
}

void main();