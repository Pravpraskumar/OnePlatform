import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type CaptureProDb = NodePgDatabase<typeof schema>;

export function createPool(connectionString: string) {
  return new Pool({ connectionString });
}

export function createDb(pool: Pool): CaptureProDb {
  return drizzle(pool, { schema });
}