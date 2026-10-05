import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { env } from '../env.js';

const key = Buffer.from(env.APP_ENCRYPTION_KEY, 'hex');
const PREFIX = 'v1:';

/** Enkripsi AES-256-GCM. Hasil: "v1:<iv>:<tag>:<data>" (base64). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) throw new Error('Format data terenkripsi tidak dikenal');
  const [iv, tag, data] = value.slice(PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Hash tetap (HMAC-SHA256) untuk mengecek duplikat tanpa membuka enkripsi.
 * Nilai dinormalisasi: huruf besar, tanpa spasi.
 */
export function fingerprint(value: string): string {
  return createHmac('sha256', key).update(value.replace(/\s+/g, '').toUpperCase()).digest('hex');
}
