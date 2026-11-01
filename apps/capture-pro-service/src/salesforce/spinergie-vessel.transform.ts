import { BadGatewayException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { SpinergieSpecificationValue } from '../db/schema';

function isSpecificationValue(value: unknown, depth = 0): value is SpinergieSpecificationValue {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 100_000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10_000 && value.every((item: unknown) => isSpecificationValue(item, depth + 1));
  return typeof value === 'object' && Object.keys(value).length <= 500
    && Object.values(value).every((item: unknown) => isSpecificationValue(item, depth + 1));
}

export function parseSpinergieVessels(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50_000) {
    throw new BadGatewayException('Spinergie returned an empty, oversized, or incomplete vessel extract. Stored vessels have not been changed.');
  }
  const ids = new Set<string>();
  return value.map((record: unknown) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || !isSpecificationValue(record) || !('vesselId' in record)
      || typeof record.vesselId !== 'number' || !Number.isSafeInteger(record.vesselId) || record.vesselId <= 0) {
      throw new BadGatewayException('Spinergie returned invalid vessel specifications. Stored vessels have not been changed.');
    }
    const vesselId = String(record.vesselId);
    if (ids.has(vesselId)) throw new BadGatewayException('Spinergie returned duplicate vessel identifiers. Stored vessels have not been changed.');
    ids.add(vesselId);
    return { vesselId, name: typeof record.vessel === 'string' ? record.vessel : null, fields: record };
  });
}

function canonicalValue(value: SpinergieSpecificationValue): SpinergieSpecificationValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function parseSpinergieCharters(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50_000) {
    throw new BadGatewayException('Spinergie returned an empty, oversized, or incomplete charter extract. Stored charters have not been changed.');
  }
  const records = value.map((record: unknown) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || !isSpecificationValue(record)
      || !('vesselId' in record) || typeof record.vesselId !== 'number' || !Number.isSafeInteger(record.vesselId) || record.vesselId <= 0) {
      throw new BadGatewayException('Spinergie returned invalid charter records. Stored charters have not been changed.');
    }
    const charterId = createHash('sha256').update(JSON.stringify(canonicalValue(record))).digest('hex');
    return { charterId, vesselId: String(record.vesselId), name: typeof record.vesselTitle === 'string' ? record.vesselTitle : null, fields: record };
  });
  return { receivedCount: value.length, records: [...new Map(records.map((record) => [record.charterId, record])).values()] };
}