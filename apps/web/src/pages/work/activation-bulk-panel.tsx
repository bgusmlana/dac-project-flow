import type { MasterDto, WorkProjectDto } from '@manpro/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInvalidateWork } from '@/hooks/use-invalidate-work';
import { useMasterOptions } from '@/hooks/use-options';
import { api, errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { BulkPanelProps } from './stage-panels';

/** Aktivasi massal untuk project besar: satu jenis aktivasi untuk banyak unit sekaligus. */
export function ActivationBulkPanel({ projectId }: BulkPanelProps) {
  const invalidate = useInvalidateWork();
  const types = useMasterOptions<MasterDto & { name: string }>('activation-types');
  const software = useMasterOptions<MasterDto & { name: string }>('software');
  const projects = useQuery({ queryKey: ['work', 'activation', 'projects'], queryFn: () => api<WorkProjectDto[]>('/api/work/activation/projects') });
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [version, setVersion] = useState('');
  const [withKey, setWithKey] = useState(true);
  const [complete, setComplete] = useState(true);
  const [count, setCount] = useState('');
  const project = projects.data?.find((p) => p.projectId === projectId);
  const max = Math.min(project?.count ?? 0, 5000);

  const run = useMutation({
    mutationFn: async () => {
      const n = count ? Math.min(Number(count), max) : max;
      const unitIds = await api<number[]>(`/api/work/activation/ids?projectId=${projectId}&limit=${n}`);
      const id = Number(target.slice(2));
      const isSw = target.startsWith('s:');
      return api<{ activated: number; keysUsed: number; moved: number }>('/api/work/activation/bulk', {
        method: 'POST',
        body: { unitIds, activationTypeId: isSw ? null : id, softwareId: isSw ? id : null, softwareVersion: isSw ? version : null, withKey, complete },
      });
    },
    onSuccess: (r) => {
      toast.success(`${formatNumber(r.activated)} unit diaktivasi (${formatNumber(r.keysUsed)} key dipakai)${r.moved ? `, ${formatNumber(r.moved)} lanjut ke tahap berikutnya` : ''}`);
      invalidate();
      setCount('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!open) {
    return (
      <Button variant="outline" className="justify-self-start" onClick={() => setOpen(true)}>
        <Zap /> Aktivasi Massal (project besar)
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivasi Massal</CardTitle>
        <CardDescription>
          Catat satu jenis aktivasi untuk banyak unit sekaligus (maksimal 5.000 per proses). Pilih project dulu di filter antrian di bawah.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!projectId ? (
          <p className="text-sm text-orange-600">Pilih project pada filter “Antrian Aktivasi” di bawah.</p>
        ) : (
          <p className="text-sm">
            Project <b>{project?.code}</b>: {formatNumber(project?.count ?? 0)} unit di antrian aktivasi.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label className="text-xs">Jenis aktivasi / software</Label>
            <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Pilih…</option>
              <optgroup label="Jenis aktivasi">
                {types.data?.map((t) => (
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
          {target.startsWith('s:') && (
            <div className="grid gap-1">
              <Label className="text-xs">Versi</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
          )}
          <div className="grid gap-1">
            <Label className="text-xs">Jumlah unit (kosong = semua, maks. {formatNumber(max)})</Label>
            <Input type="number" min={1} max={max} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} /> Ambil license key dari stok untuk setiap unit
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} /> Langsung selesaikan tahap aktivasi
          </label>
        </div>
        <div className="flex gap-2">
          <Button disabled={!projectId || !target || max === 0 || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? 'Memproses…' : 'Jalankan'}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Tutup
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
