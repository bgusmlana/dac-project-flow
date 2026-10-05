import { describe, expect, it } from 'vitest';
import { canManageProjects, canWorkStage, firstStatus, itemStages, nextStatus, reworkTargets } from './workflow.js';
import type { Stage, StageRequirement } from './enums.js';

const laptop: { stage: Stage; requirement: StageRequirement }[] = [
  { stage: 'assembling', requirement: 'optional' },
  { stage: 'activation', requirement: 'required' },
  { stage: 'qc', requirement: 'required' },
  { stage: 'packing', requirement: 'required' },
  { stage: 'shipping', requirement: 'required' },
  { stage: 'installation', requirement: 'skipped' },
];

describe('alur tahapan', () => {
  it('tahap opsional hanya dipakai kalau dipilih', () => {
    expect(itemStages(laptop, [])).toEqual(['activation', 'qc', 'packing', 'shipping']);
    expect(itemStages(laptop, ['assembling'])).toEqual(['assembling', 'activation', 'qc', 'packing', 'shipping']);
  });
  it('tahap yang dilewati tidak bisa dipilih', () => {
    expect(itemStages(laptop, ['installation'])).not.toContain('installation');
  });
  it('status awal & berikutnya', () => {
    const stages = itemStages(laptop, []);
    expect(firstStatus(stages)).toBe('activation');
    expect(nextStatus(stages, 'activation')).toBe('qc');
    expect(nextStatus(stages, 'shipping')).toBe('completed');
    expect(() => nextStatus(stages, 'assembling')).toThrow();
  });
  it('tujuan rework dari QC hanya tahap sebelumnya (assembling/aktivasi)', () => {
    expect(reworkTargets(itemStages(laptop, ['assembling']), 'qc')).toEqual(['assembling', 'activation']);
    expect(reworkTargets(itemStages(laptop, []), 'qc')).toEqual(['activation']);
  });
});

describe('hak akses tahap', () => {
  it('divisi hanya mengerjakan tahapnya', () => {
    const qc = { id: 'a', role: 'staff' as const, divisionId: 4, divisionCode: 'QC' as const };
    expect(canWorkStage(qc, 'qc')).toBe(true);
    expect(canWorkStage(qc, 'packing')).toBe(false);
    const logistik = { id: 'b', role: 'staff' as const, divisionId: 6, divisionCode: 'LOGISTICS' as const };
    expect(canWorkStage(logistik, 'shipping')).toBe(true);
    expect(canWorkStage(logistik, 'installation')).toBe(true);
    expect(canManageProjects(qc)).toBe(false);
    expect(canManageProjects({ ...qc, divisionCode: 'ADMIN' })).toBe(true);
  });
});
