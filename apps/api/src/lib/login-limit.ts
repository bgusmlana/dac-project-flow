import { Redis } from 'ioredis';
import { env } from '../env.js';

/**
 * Pembatas percobaan login (anti tebak password), disimpan di Redis.
 * - Per username: 5 kali salah → dikunci 15 menit.
 * - Per alamat IP: 30 kali salah → dikunci 15 menit (mencegah menebak banyak akun sekaligus).
 * Login berhasil menghapus hitungan username tersebut.
 */
export const LOGIN_LIMIT = { perUser: 5, perIp: 30, windowSeconds: 15 * 60 };

// Test memakai awalan acak supaya hitungan antar-run tidak saling mengganggu.
const prefix = env.NODE_ENV === 'test' ? `manpro-test:${process.pid}:${Date.now()}:login` : 'manpro:login';

let redis: Redis | null = null;
function client() {
  redis ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: false });
  return redis;
}

export async function closeLoginLimiter() {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}

const userKey = (username: string) => `${prefix}:user:${username.trim().toLowerCase()}`;
const ipKey = (ip: string) => `${prefix}:ip:${ip}`;

/** Sisa detik penguncian (0 = boleh mencoba). */
export async function loginBlockedFor(username: string, ip: string): Promise<number> {
  const r = client();
  const [[, u], [, i]] = (await r.multi().get(userKey(username)).get(ipKey(ip)).exec()) as [[null, string | null], [null, string | null]];
  const keys: string[] = [];
  if (Number(u) >= LOGIN_LIMIT.perUser) keys.push(userKey(username));
  if (Number(i) >= LOGIN_LIMIT.perIp) keys.push(ipKey(ip));
  if (!keys.length) return 0;
  const ttls = await Promise.all(keys.map((k) => r.ttl(k)));
  return Math.max(1, ...ttls);
}

export async function recordLoginFailure(username: string, ip: string) {
  const r = client();
  const tx = r.multi();
  for (const k of [userKey(username), ipKey(ip)]) {
    // SET NX EX membuat hitungan baru dengan masa berlaku; INCR tidak mengubah masa berlakunya (cocok untuk Redis 5).
    tx.set(k, '0', 'EX', LOGIN_LIMIT.windowSeconds, 'NX');
    tx.incr(k);
  }
  await tx.exec();
}

export async function recordLoginSuccess(username: string) {
  await client().del(userKey(username));
}
