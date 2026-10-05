export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const forbidden = (message = 'Anda tidak memiliki akses untuk tindakan ini') => new HttpError(403, message);
export const notFound = (message = 'Data tidak ditemukan') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

/** Apakah error berasal dari pelanggaran UNIQUE di MySQL (data ganda)? */
export function isDuplicateKeyError(error: unknown): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return true;
  }
  return false;
}
