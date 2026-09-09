import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM at-rest encryption for product DB connection secrets.
// Used as a fallback when Azure Key Vault references are not configured.
const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const b64 = process.env.CONNECTION_SECRET_KEY;
  if (!b64) throw new Error('CONNECTION_SECRET_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('CONNECTION_SECRET_KEY must decode to 32 bytes');
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith('enc:')) {
    // Treat as a Key Vault reference or plaintext handled elsewhere.
    return payload;
  }
  const [, ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
