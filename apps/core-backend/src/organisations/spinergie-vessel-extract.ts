import { BadGatewayException } from '@nestjs/common';

export const SPINERGIE_VESSEL_SPECS_URL = 'https://intelligence.spinergie.com/base/api/vessel/specs';
export const SPINERGIE_VESSEL_CHARTERS_URL = 'https://intelligence.spinergie.com/base/api/vessel/charters';
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export async function fetchSpinergieVesselSpecs(apiKey: string): Promise<unknown> {
  return fetchSpinergieData(apiKey, 'specs');
}

export async function fetchSpinergieVesselCharters(apiKey: string): Promise<unknown> {
  return fetchSpinergieData(apiKey, 'charters');
}

async function fetchSpinergieData(apiKey: string, dataset: 'specs' | 'charters'): Promise<unknown> {
  const label = dataset === 'specs' ? 'vessel specifications' : 'vessel charters';
  const specification = dataset === 'specs' ? 'vessel-specification' : 'vessel-charter';
  try {
    const response = await fetch(dataset === 'specs' ? SPINERGIE_VESSEL_SPECS_URL : SPINERGIE_VESSEL_CHARTERS_URL, {
      headers: { Accept: 'application/json', apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new BadGatewayException(response.status === 401 || response.status === 403
        ? `Spinergie rejected the saved API key or its ${specification} access.`
        : `Spinergie ${label} returned HTTP ${response.status}.`);
    }
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) {
      await response.body?.cancel();
      throw new BadGatewayException(`Spinergie returned an unsupported ${specification} response.`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BadGatewayException(`Spinergie ${label} exceeded the permitted response size.`);
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(body) || body.length === 0 || body.length > 50_000) {
      throw new BadGatewayException(`Spinergie returned an empty, oversized, or unsupported ${specification} extract. Stored ${dataset === 'specs' ? 'vessels' : 'charters'} have not been changed.`);
    }
    return body;
  } catch (error: unknown) {
    if (error instanceof BadGatewayException) throw error;
    throw new BadGatewayException(`Spinergie ${label} could not be retrieved. Check connectivity, certificate trust, and provider availability.`);
  }
}