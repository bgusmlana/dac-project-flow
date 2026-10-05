import { describe, expect, it } from 'vitest';
import { decodeId, encodeId, tryDecodeId } from '../src/lib/public-id.js';

describe('ID publik', () => {
  it('bolak-balik tanpa kehilangan data, panjang tetap 22 karakter', () => {
    for (const n of [1, 2, 100, 50_000, 2 ** 40]) {
      const s = encodeId('unit', n);
      expect(s).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(decodeId('unit', s)).toBe(n);
    }
  });

  it('ID berurutan menghasilkan kode yang tidak berurutan / tidak mirip', () => {
    const a = encodeId('unit', 100);
    const b = encodeId('unit', 101);
    const same = [...a].filter((ch, i) => b[i] === ch).length;
    expect(same).toBeLessThan(8);
  });

  it('ID project tidak bisa dipakai sebagai ID unit', () => {
    expect(tryDecodeId('unit', encodeId('project', 5))).toBeNull();
  });

  it('angka biasa, kode rusak, dan kode karangan ditolak', () => {
    expect(tryDecodeId('unit', '100')).toBeNull();
    const s = encodeId('unit', 7);
    const tampered = (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(tryDecodeId('unit', tampered)).toBeNull();
    expect(tryDecodeId('unit', 'AAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
    expect(() => decodeId('unit', 'abc')).toThrow('Data tidak ditemukan');
  });
});
