import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createDb, createPool } from './index';
import { businessEntities } from './schema';

config({ path: resolve(__dirname, '../../../../.env') });

const seedEntities = [
  {
    jobCodeEntity: 'MCD-UK',
    segment1: 'CONSTRUCTION',
    legalEntityName: 'McDermott Construction UK Ltd',
    ledgerName: 'McDermott UK Ledger',
    inventoryOrgName: 'McDermott UK Construction',
    inventoryOrgCode: 'MCD-UK-CON',
  },
  {
    jobCodeEntity: 'MCD-US',
    segment1: 'ENERGY',
    legalEntityName: 'McDermott Energy Services Inc',
    ledgerName: 'McDermott US Ledger',
    inventoryOrgName: 'McDermott US Energy',
    inventoryOrgCode: 'MCD-US-ENG',
  },
  {
    jobCodeEntity: 'MCD-EMEA',
    segment1: 'ENGINEERING',
    legalEntityName: 'McDermott Engineering EMEA BV',
    ledgerName: 'McDermott EMEA Ledger',
    inventoryOrgName: 'McDermott EMEA Engineering',
    inventoryOrgCode: 'MCD-EMEA-ENG',
  },
] as const;

async function main() {
  const url = process.env.CREDITGUARD_DATABASE_URL;
  if (!url) throw new Error('CREDITGUARD_DATABASE_URL is not set');

  const pool = createPool(url);
  const db = createDb(pool);

  console.log('Seeding CreditGuard business entities...');
  for (const entity of seedEntities) {
    await db
      .insert(businessEntities)
      .values(entity)
      .onConflictDoUpdate({
        target: [businessEntities.jobCodeEntity, businessEntities.segment1, businessEntities.legalEntityName],
        set: {
          ledgerName: entity.ledgerName,
          inventoryOrgName: entity.inventoryOrgName,
          inventoryOrgCode: entity.inventoryOrgCode,
          updatedAt: new Date(),
        },
      });
  }

  await pool.end();
  console.log(`Seeded ${seedEntities.length} CreditGuard business entities.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});