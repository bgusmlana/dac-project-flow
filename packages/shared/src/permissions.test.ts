import { describe, expect, it } from 'vitest';
import { assignableRoles, canAssign, canManageUser, canViewUser, validateRoleDivision, type Actor } from './permissions.js';

const superAdmin: Actor = { id: 'sa', role: 'super_admin', divisionId: null };
const manager: Actor = { id: 'm', role: 'manager', divisionId: null };
const leaderQc: Actor = { id: 'lq', role: 'leader', divisionId: 4 };
const leaderPacking: Actor = { id: 'lp', role: 'leader', divisionId: 5 };
const staffQc: Actor = { id: 'sq', role: 'staff', divisionId: 4 };
const staffPacking: Actor = { id: 'sp', role: 'staff', divisionId: 5 };

describe('canViewUser', () => {
  it('super admin & manager melihat semua user', () => {
    for (const t of [leaderQc, staffPacking, manager]) {
      expect(canViewUser(superAdmin, t)).toBe(true);
      expect(canViewUser(manager, t)).toBe(true);
    }
  });
  it('leader hanya melihat user divisinya', () => {
    expect(canViewUser(leaderQc, staffQc)).toBe(true);
    expect(canViewUser(leaderQc, staffPacking)).toBe(false);
    expect(canViewUser(leaderQc, leaderPacking)).toBe(false);
    expect(canViewUser(leaderQc, manager)).toBe(false);
  });
  it('staff hanya melihat dirinya', () => {
    expect(canViewUser(staffQc, staffQc)).toBe(true);
    expect(canViewUser(staffQc, leaderQc)).toBe(false);
  });
});

describe('canAssign', () => {
  it('leader hanya bisa membuat staff di divisinya', () => {
    expect(canAssign(leaderQc, 'staff', 4)).toBe(true);
    expect(canAssign(leaderQc, 'staff', 5)).toBe(false);
    expect(canAssign(leaderQc, 'leader', 4)).toBe(false);
    expect(canAssign(leaderQc, 'manager', null)).toBe(false);
  });
  it('manager tidak bisa membuat manager atau super admin', () => {
    expect(canAssign(manager, 'leader', 4)).toBe(true);
    expect(canAssign(manager, 'manager', null)).toBe(false);
    expect(canAssign(manager, 'super_admin', null)).toBe(false);
  });
  it('staff tidak bisa membuat user', () => {
    expect(assignableRoles(staffQc)).toEqual([]);
    expect(canAssign(staffQc, 'staff', 4)).toBe(false);
  });
});

describe('canManageUser', () => {
  it('tidak bisa mengelola diri sendiri', () => {
    expect(canManageUser(superAdmin, superAdmin)).toBe(false);
    expect(canManageUser(leaderQc, leaderQc)).toBe(false);
  });
  it('leader mengelola staff divisinya saja, bukan leader lain', () => {
    expect(canManageUser(leaderQc, staffQc)).toBe(true);
    expect(canManageUser(leaderQc, staffPacking)).toBe(false);
    expect(canManageUser(leaderQc, { id: 'lq2', role: 'leader', divisionId: 4 })).toBe(false);
  });
  it('manager tidak bisa mengelola manager lain', () => {
    expect(canManageUser(manager, { id: 'm2', role: 'manager', divisionId: null })).toBe(false);
    expect(canManageUser(manager, leaderQc)).toBe(true);
  });
  it('super admin bisa mengelola siapa pun selain dirinya', () => {
    expect(canManageUser(superAdmin, { id: 'sa2', role: 'super_admin', divisionId: null })).toBe(true);
  });
});

describe('validateRoleDivision', () => {
  it('leader/staff wajib divisi, manager/super admin tanpa divisi', () => {
    expect(validateRoleDivision('staff', null)).not.toBeNull();
    expect(validateRoleDivision('leader', 3)).toBeNull();
    expect(validateRoleDivision('manager', 3)).not.toBeNull();
    expect(validateRoleDivision('super_admin', null)).toBeNull();
  });
});

describe('master data', () => {
  it('super admin, manager, dan divisi Admin Project boleh mengelola master data', async () => {
    const { canManageMasterData } = await import('./permissions.js');
    expect(canManageMasterData(superAdmin)).toBe(true);
    expect(canManageMasterData(manager)).toBe(true);
    expect(canManageMasterData({ id: 'a', role: 'staff', divisionId: 1, divisionCode: 'ADMIN' })).toBe(true);
    expect(canManageMasterData({ ...leaderQc, divisionCode: 'QC' })).toBe(false);
    expect(canManageMasterData({ ...staffQc, divisionCode: 'QC' })).toBe(false);
  });
  it('hanya super admin & manager yang boleh mengatur jenis produk', async () => {
    const { canConfigureProductTypes } = await import('./permissions.js');
    expect(canConfigureProductTypes(superAdmin)).toBe(true);
    expect(canConfigureProductTypes(manager)).toBe(true);
    expect(canConfigureProductTypes({ id: 'a', role: 'leader', divisionId: 1, divisionCode: 'ADMIN' })).toBe(false);
  });
});

describe('skema jenis produk', () => {
  it('tahap ekspedisi tidak boleh dilewati', async () => {
    const { updateProductTypeSchema } = await import('./master.js');
    const { STAGES } = await import('./enums.js');
    const base = { code: 'LAPTOP', name: 'Laptop', componentCategoryIds: [], activationTypeIds: [] };
    const ok = updateProductTypeSchema.safeParse({ ...base, stages: STAGES.map((stage) => ({ stage, requirement: 'required' })) });
    expect(ok.success).toBe(true);
    const bad = updateProductTypeSchema.safeParse({
      ...base,
      stages: STAGES.map((stage) => ({ stage, requirement: stage === 'shipping' ? 'skipped' : 'required' })),
    });
    expect(bad.success).toBe(false);
  });
  it('kolom bertipe pilihan wajib punya opsi & kunci tidak boleh sama', async () => {
    const { customFieldsSchema } = await import('./master.js');
    expect(customFieldsSchema.safeParse({ fields: [{ key: 'ukuran', label: 'Ukuran', inputType: 'select', options: [] }] }).success).toBe(false);
    expect(
      customFieldsSchema.safeParse({
        fields: [
          { key: 'a', label: 'A', inputType: 'text' },
          { key: 'a', label: 'B', inputType: 'text' },
        ],
      }).success,
    ).toBe(false);
    expect(customFieldsSchema.safeParse({ fields: [{ key: 'ukuran', label: 'Ukuran', inputType: 'select', options: ['65"'] }] }).success).toBe(true);
  });
});
