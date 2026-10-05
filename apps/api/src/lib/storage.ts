import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';

/**
 * Penyimpanan file di disk lokal (STORAGE_DIR).
 * Semua akses file lewat modul ini, supaya nanti mudah diganti ke object storage (S3-compatible).
 */
const root = path.resolve(env.STORAGE_DIR);

function resolveKey(key: string) {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Path file tidak valid');
  return full;
}

export async function putFile(key: string, data: Buffer | Uint8Array) {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function deleteFile(key: string) {
  await rm(resolveKey(key), { force: true });
}

export function filePath(key: string) {
  return resolveKey(key);
}
