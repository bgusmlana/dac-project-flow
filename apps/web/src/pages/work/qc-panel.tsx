import { STAGE_LABELS, type InspectResultDto, type QcFormDto, type QcInspectionDto } from '@manpro/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PhotoGallery } from '@/components/photo-gallery';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui-extra';
import { useInvalidateWork } from '@/hooks/use-invalidate-work';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { UnitPanelProps } from './stage-panels';

export function QcPanel({ unit, onDone }: UnitPanelProps) {
  const form = useQuery({ queryKey: ['qc-form', unit.id], queryFn: () => api<QcFormDto>(`/api/qc/units/${unit.id}`) });
  if (form.isLoading) return <p className="text-sm text-muted-foreground">Memuat checklist…</p>;
  if (!form.data) return <p className="text-sm text-destructive">{errorMessage(form.error)}</p>;
  return <QcForm key={unit.id} form={form.data} unitSn={unit.serialNumber} onDone={onDone} />;
}

function QcForm({ form, unitSn, onDone }: { form: QcFormDto; unitSn: string; onDone: () => void }) {
  const invalidate = useInvalidateWork();
  const [passed, setPassed] = useState<Record<number, boolean>>({});
  const [values, setValues] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [reworkTo, setReworkTo] = useState(form.reworkTargets.at(-1) ?? '');
  const anyFail = form.items.some((i) => i.inputType === 'pass_fail' && passed[i.id] === false);

  const submit = useMutation({
    mutationFn: () =>
      api<InspectResultDto>(`/api/qc/units/${form.unitId}/inspect`, {
        method: 'POST',
        body: {
          results: form.items.map((i) => ({ itemId: i.id, passed: i.inputType === 'pass_fail' ? (passed[i.id] ?? null) : null, value: values[i.id] ?? null })),
          notes,
          reworkTo: anyFail && reworkTo ? reworkTo : null,
        },
      }),
    onSuccess: (r) => {
      if (r.result === 'pass') toast.success(`${unitSn} LULUS QC`);
      else toast.warning(`${unitSn} GAGAL QC${r.unitStatus !== 'qc' ? ` → dikembalikan ke ${r.unitStatus}` : ''}`);
      if (r.lot) toast.info(`Lot ${r.lot.code}: ${r.lot.inspected}/${r.lot.sampleSize} sampel diperiksa, ${r.lot.failed} gagal`);
      invalidate();
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (form.qcMode === 'sampling' && !form.isSample) {
    return (
      <p className="rounded-lg border bg-muted/40 p-3 text-sm">
        {form.lot ? `Unit ini masuk lot ${form.lot.code} tapi bukan sampel. Hanya unit sampel yang diperiksa.` : 'Project ini memakai QC sampling. Bentuk lot dulu di panel “Lot QC” di atas.'}
      </p>
    );
  }
  if (form.items.length === 0) return <p className="text-sm text-orange-600">Jenis produk ini belum punya checklist QC. Atur di Master Data → Jenis Produk.</p>;

  return (
    <div className="grid gap-4">
      {form.lot && (
        <p className="text-sm">
          Sampel lot <b>{form.lot.code}</b>
        </p>
      )}
      <div className="grid gap-2">
        <Label>Checklist QC (versi {form.templateVersion})</Label>
        {form.items.map((i, n) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <span className="text-sm">
              {n + 1}. {i.label}
              {i.isRequired && <span className="text-destructive">*</span>}
            </span>
            {i.inputType === 'pass_fail' ? (
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(passed[i.id] === true && 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white')}
                  onClick={() => setPassed((p) => ({ ...p, [i.id]: true }))}
                >
                  <Check /> Lulus
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(passed[i.id] === false && 'border-destructive bg-destructive text-white hover:bg-destructive/90 hover:text-white')}
                  onClick={() => setPassed((p) => ({ ...p, [i.id]: false }))}
                >
                  <X /> Gagal
                </Button>
              </div>
            ) : (
              <Input
                className="w-48"
                type={i.inputType === 'number' ? 'number' : 'text'}
                value={values[i.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))}
              />
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() => setPassed(Object.fromEntries(form.items.filter((i) => i.inputType === 'pass_fail').map((i) => [i.id, true])))}
        >
          Tandai semua lulus
        </Button>
      </div>

      <PhotoGallery entityType="unit" entityId={form.unitId} category="qc" canUpload title="Foto QC" />

      <div className="grid gap-1">
        <Label className="text-xs">Catatan {anyFail && <span className="text-destructive">* (wajib jika gagal)</span>}</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={anyFail ? 'Jelaskan kerusakan/temuan…' : ''} />
      </div>

      {anyFail && (
        <div className="grid gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <Label className="text-xs">Unit gagal → kembalikan ke</Label>
          <NativeSelect className="w-60" value={reworkTo} onChange={(e) => setReworkTo(e.target.value)}>
            <option value="">Tetap di QC (periksa ulang)</option>
            {form.reworkTargets.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          {form.qcMode === 'sampling' && <p className="text-xs text-muted-foreground">Untuk sampel lot, pengembalian dijalankan saat lot selesai dievaluasi.</p>}
        </div>
      )}

      <Button className="justify-self-start" variant={anyFail ? 'destructive' : 'default'} disabled={submit.isPending} onClick={() => submit.mutate()}>
        {anyFail ? 'Simpan: GAGAL QC' : 'Simpan: LULUS QC'}
      </Button>

      {form.history.length > 0 && <QcHistory items={form.history} />}
    </div>
  );
}

export function QcHistory({ items }: { items: QcInspectionDto[] }) {
  return (
    <div className="grid gap-2">
      <Label>Riwayat QC</Label>
      {items.map((h) => (
        <details key={h.id} className="rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer">
            <b className={h.result === 'pass' ? 'text-emerald-700' : 'text-destructive'}>{h.result === 'pass' ? 'LULUS' : 'GAGAL'}</b> · {formatDateTime(h.createdAt)} · {h.inspectedByName}
            {h.lotCode && ` · sampel ${h.lotCode}`} · checklist v{h.templateVersion}
          </summary>
          <ul className="mt-2 grid gap-1 text-xs">
            {h.results.map((r, i) => (
              <li key={i}>
                {r.label}: {r.passed === null ? (r.value ?? '—') : r.passed ? '✓ lulus' : '✗ gagal'}
              </li>
            ))}
          </ul>
          {h.notes && <p className="mt-2 rounded bg-muted px-2 py-1 text-xs">{h.notes}</p>}
        </details>
      ))}
    </div>
  );
}
