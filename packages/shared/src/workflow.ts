import { STAGES, type DivisionCode, type Stage, type StageRequirement } from './enums.js';
import type { Actor } from './permissions.js';

/**
 * Status unit = tahap tempat unit sedang berada (menunggu / dikerjakan), atau `completed`.
 * Urutan tahapan tiap unit ditentukan oleh item project-nya (lihat `itemStages`).
 */
export const UNIT_STATUSES = [...STAGES, 'completed'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  assembling: 'Assembling',
  activation: 'Aktivasi',
  qc: 'QC',
  packing: 'Packing',
  shipping: 'Pengiriman',
  installation: 'Instalasi',
  completed: 'Selesai',
};

/** Divisi yang mengerjakan setiap tahap. */
export const STAGE_DIVISION: Record<Stage, DivisionCode> = {
  assembling: 'ASSEMBLING',
  activation: 'ACTIVATION',
  qc: 'QC',
  packing: 'PACKING',
  shipping: 'LOGISTICS',
  installation: 'LOGISTICS',
};

/**
 * Tahapan yang dilalui unit dari satu item project:
 * semua tahap wajib + tahap opsional yang dipilih saat item dibuat, dalam urutan standar.
 */
export function itemStages(
  typeStages: { stage: Stage; requirement: StageRequirement }[],
  chosenOptional: readonly Stage[],
): Stage[] {
  const req = new Map(typeStages.map((s) => [s.stage, s.requirement]));
  return STAGES.filter((s) => req.get(s) === 'required' || (req.get(s) === 'optional' && chosenOptional.includes(s)));
}

/** Status awal unit baru. */
export function firstStatus(stages: readonly Stage[]): UnitStatus {
  return stages[0] ?? 'completed';
}

/** Status berikutnya setelah tahap `current` selesai. */
export function nextStatus(stages: readonly Stage[], current: UnitStatus): UnitStatus {
  if (current === 'completed') return 'completed';
  const i = stages.indexOf(current);
  if (i === -1) throw new Error(`Tahap ${current} tidak ada di alur unit ini`);
  return stages[i + 1] ?? 'completed';
}

/** Tahap sebelumnya yang bisa menjadi tujuan rework dari tahap `current` (misalnya QC gagal). */
export function reworkTargets(stages: readonly Stage[], current: Stage): Stage[] {
  const i = stages.indexOf(current);
  return stages.slice(0, Math.max(i, 0)).filter((s) => s === 'assembling' || s === 'activation');
}

/** Boleh mengerjakan tahap ini (Super Admin, Manager, atau divisi pemilik tahap)? */
export function canWorkStage(actor: Actor, stage: Stage): boolean {
  return actor.role === 'super_admin' || actor.role === 'manager' || actor.divisionCode === STAGE_DIVISION[stage];
}

/** Boleh membuat/mengubah project, item, dan unit (Super Admin, Manager, divisi Admin Project)? */
export function canManageProjects(actor: Actor): boolean {
  return actor.role === 'super_admin' || actor.role === 'manager' || actor.divisionCode === 'ADMIN';
}
