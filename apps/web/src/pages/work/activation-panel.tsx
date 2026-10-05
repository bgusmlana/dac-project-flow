import { canManageLicenseKeys, type MasterDto, type UnitDetailDto } from '@manpro/shared';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Eye, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInvalidateWork } from '@/hooks/use-invalidate-work';
import { useMe } from '@/hooks/use-me';
import { useMasterOptions } from '@/hooks/use-options';
import { api, errorMessage } from '@/lib/api';
import type { UnitPanelProps } from './stage-panels';

type KeyMode = 'auto' | 'manual' | 'none';

export function ActivationPanel({ unit, onChange, onDone }: UnitPanelProps) {
  const me = useMe().data!;
  const invalidate = useInvalidateWork();
  const software = useMasterOptions<MasterDto & { name: string }>('software');
  const [target, setTarget] = useState(unit.activationTypes[0] ? `t:${unit.activationTypes[0].id}` : '');
  const [version, setVersion] = useState('');
  const [mode, setMode] = useState<KeyMode>('auto');
  const [manualKey, setManualKey] = useState('');
  const [failed, setFailed] = useState(false);
  const [notes, setNotes] = useState('');
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const isSoftware = target.startsWith('s:');

  const add = useMutation({
    mutationFn: () => {
      const id = Number(target.slice(2));
      return api<UnitDetailDto>(`/api/units/${unit.id}/activations`, {
        method: 'POST',
        body: {
          activationTypeId: isSoftware ? null : id,
          softwareId: isSoftware ? id : null,
          softwareVersion: isSoftware ? version : null,
          autoAssign: mode === 'auto',
          manualKey: mode === 'manual' ? manualKey : null,
          result: failed ? 'failed' : 'success',
          notes,
        },
      });
    },
    onSuccess: (u) => {
      onChange(u);
      setManualKey('');
      setNotes('');
      setFailed(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api<UnitDetailDto>(`/api/units/${unit.id}/activations/${id}`, { method: 'DELETE' }),
    onSuccess: onChange,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reveal = useMutation({
    mutationFn: (keyId: number) => api<{ key: string }>(`/api/license-keys/${keyId}/reveal`, { method: 'POST' }),
    onSuccess: (r, keyId) => setRevealed((x) => ({ ...x, [keyId]: r.key })),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const complete = useMutation({
    mutationFn: () => api('/api/work/activation/complete', { method: 'POST', body: { unitIds: [unit.id] } }),
    onSuccess: () => {
      toast.success(`${unit.serialNumber} selesai aktivasi`);
      invalidate();
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const hasSuccess = unit.activations.some((a) => a.result === 'success');

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Aktivasi tercatat ({unit.activations.length})</Label>
        {unit.activations.length === 0 && <p className="text-sm text-muted-foreground">Belum ada aktivasi.</p>}
        {unit.activations.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <span>
              <b>{a.targetName}</b>
              {a.softwareVersion && ` ${a.softwareVersion}`}
              {a.result === 'failed' ? <span className="text-destructive"> · GAGAL</span> : <span className="text-emerald-700"> · berhasil</span>}
              {a.licenseKeyId && <span className="font-mono text-muted-foreground"> · {revealed[a.licenseKeyId] ?? a.maskedKey}</span>}
              {a.notes && <span className="text-muted-foreground"> · {a.notes}</span>}
            </span>
            <span className="flex">
              {a.licenseKeyId && canManageLicenseKeys(me) && !revealed[a.licenseKeyId] && (
                <Button variant="ghost" size="icon-sm" tooltip="Lihat key (tercatat)" onClick={() => reveal.mutate(a.licenseKeyId!)}>
                  <Eye />
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" tooltip="Hapus aktivasi" onClick={() => remove.mutate(a.id)}>
                <Trash2 />
              </Button>
            </span>
          </div>
        ))}
      </div>

      <form
        className="grid gap-3 rounded-lg border bg-muted/30 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Jenis aktivasi / software</Label>
            <NativeSelect required value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Pilih…</option>
              <optgroup label="Jenis aktivasi">
                {unit.activationTypes.map((t) => (
                  <option key={t.id} value={`t:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Software">
                {software.data?.map((s) => (
                  <option key={s.id} value={`s:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
          </div>
          {isSoftware && (
            <div className="grid gap-1">
              <Label className="text-xs">Versi</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="contoh: 2024" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ['auto', 'Ambil key dari stok'],
              ['manual', 'Ketik / scan key'],
              ['none', 'Tanpa key (lisensi digital)'],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="keymode" checked={mode === v} onChange={() => setMode(v)} />
              {l}
            </label>
          ))}
        </div>
        {mode === 'manual' && <Input required className="font-mono" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" value={manualKey} onChange={(e) => setManualKey(e.target.value)} />}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={failed} onChange={(e) => setFailed(e.target.checked)} /> Aktivasi gagal
          </label>
          <Input className="max-w-sm flex-1" placeholder="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!target || add.isPending}>
            <Plus /> Catat Aktivasi
          </Button>
        </div>
      </form>

      <Button className="justify-self-start" disabled={!hasSuccess || complete.isPending} onClick={() => complete.mutate()}>
        <CheckCircle2 /> Selesai Aktivasi
      </Button>
    </div>
  );
}
