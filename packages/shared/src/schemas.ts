import { z } from 'zod';
import { ROLES, type DivisionCode } from './enums.js';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username minimal 3 karakter')
  .max(30, 'Username maksimal 30 karakter')
  .regex(/^[a-z0-9._]+$/, 'Username hanya boleh huruf kecil, angka, titik, dan garis bawah');

/**
 * ID publik (project, unit, koli, pengiriman, foto): teks acak terenkripsi, bukan angka urut.
 * Server menerjemahkannya kembali ke ID angka; ID yang tidak valid dianggap tidak ditemukan.
 */
export const publicIdSchema = z.string().trim().min(1, 'ID tidak valid').max(64);
/** Versi opsional untuk filter/query (string kosong = tidak difilter). */
export const optionalPublicIdSchema = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((v) => (v ? v : undefined));

export const passwordSchema = z.string().min(8, 'Password minimal 8 karakter').max(128);

const divisionIdSchema = z.number().int().positive().nullable();

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi').max(100),
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(ROLES),
  divisionId: divisionIdSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi').max(100),
  role: z.enum(ROLES),
  divisionId: divisionIdSchema,
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setActiveSchema = z.object({ isActive: z.boolean() });

export const resetPasswordSchema = z.object({ password: passwordSchema });

/** Ubah profil sendiri (hanya nama; role & divisi diatur oleh atasan). */
export const updateProfileSchema = z.object({ name: z.string().trim().min(1, 'Nama wajib diisi').max(100) });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Ganti password sendiri. */
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, 'Password lama wajib diisi'), newPassword: passwordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, { message: 'Password baru harus berbeda dari password lama', path: ['newPassword'] });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const listUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
  divisionId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Bentuk data user yang dikirim API ke frontend. */
export interface UserDto {
  id: string;
  name: string;
  username: string;
  role: (typeof ROLES)[number];
  divisionId: number | null;
  divisionCode: DivisionCode | null;
  divisionName: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface DivisionDto {
  id: number;
  code: string;
  name: string;
}

export interface MeDto {
  id: string;
  name: string;
  username: string;
  role: (typeof ROLES)[number];
  divisionId: number | null;
  divisionCode: DivisionCode | null;
  divisionName: string | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
