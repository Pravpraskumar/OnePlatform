import { config } from 'dotenv';
import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { decryptSecret } from '../common/crypto';
import { fetchSpinergieVesselCharters, fetchSpinergieVesselSpecs } from '../organisations/spinergie-vessel-extract';
import { assertLocalCoreDatabase } from './capture-pro-integration-menu';
import { createDb, createPool } from './index';
import { organisationProductIntegrations, products } from './schema';

config({ path: resolve(__dirname, '../../../../.env') });

function shape(value: unknown): string {
  return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
}

async function activationStatus(corePool: ReturnType<typeof createPool>, orgId: string) {
  const connectionString = process.env.CAPTUREPRO_DATABASE_URL;
  if (!connectionString) throw new Error();
  assertLocalCoreDatabase(connectionString, process.env.NODE_ENV);
  const pool = createPool(connectionString);
  const charters = process.argv.includes('--charters');
  try {
    const { rows: [tables] } = await pool.query("SELECT to_regclass('public.spinergie_vessels') IS NOT NULL AS vessels_present, to_regclass('public.spinergie_sync_runs') IS NOT NULL AS runs_present, to_regclass('public.spinergie_charters') IS NOT NULL AS charters_present, to_regclass('public.spinergie_charter_sync_runs') IS NOT NULL AS charter_runs_present, (SELECT max(created_at) FROM drizzle.__drizzle_migrations) AS latest_migration");
    const { rows: menus } = await corePool.query("SELECT menu.name, menu.route, parent.name AS parent, menu.is_active, menu.display_order FROM menus menu JOIN products product ON product.id = menu.product_id LEFT JOIN menus parent ON parent.id = menu.parent_id WHERE product.code = $1 AND (menu.name = $2 OR menu.route = ANY($3::text[])) ORDER BY menu.display_order", ['Capture-Pro', 'Spinergie', ['/app/product/Capture-Pro/spinergie-vessels', '/app/product/Capture-Pro/spinergie-charters']]);
    let counts = null;
    let lastRun = null;
    if (charters ? tables.charters_present && tables.charter_runs_present : tables.vessels_present && tables.runs_present) {
      const result = await pool.query(charters
        ? 'SELECT count(*)::int AS charter_count, count(*) FILTER (WHERE in_extract)::int AS current_charter_count FROM spinergie_charters WHERE org_id = $1'
        : 'SELECT count(*)::int AS vessel_count, count(*) FILTER (WHERE in_extract)::int AS current_vessel_count FROM spinergie_vessels WHERE org_id = $1', [orgId]);
      counts = result.rows[0];
      const runs = await pool.query(charters
        ? 'SELECT status, started_at, completed_at, received_count, matched_count, inserted_count, updated_count, removed_count FROM spinergie_charter_sync_runs WHERE org_id = $1 ORDER BY started_at DESC LIMIT 1'
        : 'SELECT status, started_at, completed_at, received_count, matched_count, inserted_count, updated_count, removed_count FROM spinergie_sync_runs WHERE org_id = $1 ORDER BY started_at DESC LIMIT 1', [orgId]);
      lastRun = runs.rows[0] ?? null;
    }
    const services = await Promise.all([4000, 4103, 5173].map(async (port) => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}${port === 5173 ? '/' : '/api/health'}`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
        await response.body?.cancel();
        return { port, responding: true, status: response.status };
      } catch { return { port, responding: false }; }
    }));
    console.log(JSON.stringify({ ...tables, menus, counts, lastRun, services, tlsVerificationDisabled: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' }, null, 2));
  } finally { await pool.end(); }
}

async function main() {
  const connectionString = process.env.CORE_DATABASE_URL;
  if (!connectionString) throw new Error();
  assertLocalCoreDatabase(connectionString, process.env.NODE_ENV);
  const pool = createPool(connectionString);
  let secret: string;
  try {
    const db = createDb(pool);
    const rows = await db.select({ secret: organisationProductIntegrations.authorizationSecret, orgId: organisationProductIntegrations.orgId })
      .from(organisationProductIntegrations).innerJoin(products, eq(products.id, organisationProductIntegrations.productId))
      .where(and(eq(products.code, 'Capture-Pro'), eq(organisationProductIntegrations.provider, 'spinergie')));
    if (rows.length !== 1 || !rows[0].secret) throw new Error();
    if (process.argv.includes('--activation-status')) {
      await activationStatus(pool, rows[0].orgId);
      return;
    }
    secret = decryptSecret(rows[0].secret);
  } finally { await pool.end(); }
  const body = await (process.argv.includes('--charters') ? fetchSpinergieVesselCharters(secret) : fetchSpinergieVesselSpecs(secret));
  const entries = body && typeof body === 'object' && !Array.isArray(body) ? Object.entries(body) : [];
  const arrays = Array.isArray(body) ? [['root', body] as const] : entries.filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]));
  console.log(JSON.stringify({
    rootType: shape(body),
    rootKeys: entries.map(([key]) => key),
    arrays: Object.fromEntries(arrays.map(([key, records]) => [key, {
      count: records.length,
      fields: records[0] && typeof records[0] === 'object'
        ? Object.fromEntries(Object.entries(records[0]).map(([field, value]) => [field, shape(value)])) : null,
    }])),
  }, null, 2));
}

main().catch(() => {
  console.error('Spinergie schema inspection failed; credentials and provider records withheld.');
  process.exitCode = 1;
});