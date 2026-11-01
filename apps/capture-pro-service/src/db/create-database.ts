import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Client } from 'pg';

config({ path: resolve(__dirname, '../../../../.env') });

async function main() {
  const configuredUrl = process.env.CAPTUREPRO_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/capturepro';
  const databaseUrl = new URL(configuredUrl);
  const databaseName = databaseUrl.pathname.replace(/^\//, '');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName)) {
    throw new Error('CAPTUREPRO_DATABASE_URL must contain a valid PostgreSQL database name');
  }

  databaseUrl.pathname = '/postgres';
  const client = new Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query('select 1 from pg_database where datname = $1', [databaseName]);
    if (existing.rowCount === 0) {
      await client.query(`create database "${databaseName}"`);
      console.log(`Created PostgreSQL database ${databaseName}.`);
    } else {
      console.log(`PostgreSQL database ${databaseName} already exists.`);
    }
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Capture-Pro database creation failed');
  process.exitCode = 1;
});
