import { DIVISION_ROLES, ROLE_LEVEL, type DivisionCode, type Role } from './enums.js';

/** Data minimum seorang user yang dibutuhkan untuk cek hak akses. */
export interface Actor {
  id: string;
  role: Role;
  divisionId: number | null;
  divisionCode?: DivisionCode | null;
}

export type TargetUser = Actor;

/** Boleh menambah/mengubah master data umum (client, vendor, katalog produk, dll.)? */
export function canManageMasterData(actor: Actor): boolean {
  return actor.role === 'super_admin' || actor.role === 'manager' || actor.divisionCode === 'ADMIN';
}

/** Boleh mengubah konfigurasi Jenis Produk (tahapan, template QC, kolom tambahan)? */
export function canConfigureProductTypes(actor: Actor): boolean {
  return actor.role === 'super_admin' || actor.role === 'manager';
}

/** Boleh membuka menu manajemen user? */
export function canAccessUserManagement(actor: Actor): boolean {
  return actor.role !== 'staff';
}

/** Boleh melihat user ini? Leader hanya melihat user divisinya sendiri. */
export function canViewUser(actor: Actor, target: TargetUser): boolean {
  switch (actor.role) {
    case 'super_admin':
    case 'manager':
      return true;
    case 'leader':
      return actor.divisionId !== null && target.divisionId === actor.divisionId;
    case 'staff':
      return actor.id === target.id;
  }
}

/** Role yang boleh diberikan actor saat membuat/mengubah user. */
export function assignableRoles(actor: Actor): Role[] {
  switch (actor.role) {
    case 'super_admin':
      return ['super_admin', 'manager', 'leader', 'staff'];
    case 'manager':
      return ['leader', 'staff'];
    case 'leader':
      return ['staff'];
    case 'staff':
      return [];
  }
}

/**
 * Boleh memberi role & divisi ini ke user?
 * - Tidak bisa memberi role setara/lebih tinggi (kecuali Super Admin).
 * - Leader hanya bisa menempatkan user di divisinya sendiri.
 */
export function canAssign(actor: Actor, role: Role, divisionId: number | null): boolean {
  if (!assignableRoles(actor).includes(role)) return false;
  if (actor.role === 'leader' && divisionId !== actor.divisionId) return false;
  return true;
}

/** Boleh mengubah / menonaktifkan / reset password user ini? */
export function canManageUser(actor: Actor, target: TargetUser): boolean {
  if (actor.id === target.id) return false;
  if (!canViewUser(actor, target)) return false;
  if (actor.role === 'super_admin') return true;
  return ROLE_LEVEL[target.role] < ROLE_LEVEL[actor.role];
}

/** Validasi kombinasi role dan divisi. Mengembalikan pesan error atau null. */
export function validateRoleDivision(role: Role, divisionId: number | null): string | null {
  const needsDivision = DIVISION_ROLES.includes(role);
  if (needsDivision && divisionId === null) return 'Leader dan Staff wajib memiliki divisi';
  if (!needsDivision && divisionId !== null) return 'Super Admin dan Manager tidak terikat divisi';
  return null;
}
