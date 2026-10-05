import { QC_MODE_LABELS, type ProjectDetailDto, type QcMode } from '@manpro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui-extra';
import { useMasterOptions, useUserOptions } from '@/hooks/use-options';
import { api, errorMessage } from '@/lib/api';

export function ProjectFormDialog({ project, onClose }: { project: ProjectDetailDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const clients = useMasterOptions('clients');
  const users = useUserOptions();
  const [f, setF] = useState({
    name: project?.name ?? '',
    clientId: String(project?.clientId ?? ''),
    poNumber: project?.poNumber ?? '',
    targetDate: project?.targetDate ?? '',
    picUserId: project?.picUserId ?? '',
    shippingAddress: project?.shippingAddress ?? '',
    notes: project?.notes ?? '',
    qcMode: (project?.qcMode ?? 'per_unit') as QcMode,
    lotSize: String(project?.lotSize ?? 500),
    samplePercent: String(project?.samplePercent ?? 5),
    maxSampleFail: String(project?.maxSampleFail ?? 0),
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const sampling = f.qcMode === 'sampling';
      const body = {
        ...f,
        clientId: Number(f.clientId),
        picUserId: f.picUserId || null,
        lotSize: sampling ? Number(f.lotSize) : null,
        samplePercent: sampling ? Number(f.samplePercent) : null,
        maxSampleFail: sampling ? Number(f.maxSampleFail) : null,
      };
      return project
        ? api<ProjectDetailDto>(`/api/projects/${project.id}`, { method: 'PUT', body })
        : api<ProjectDetailDto>('/api/projects', { method: 'POST', body });
    },
    onSuccess: (p) => {
      toast.success(project ? 'Project diperbarui' : `Project ${p.code} dibuat`);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.setQueryData(['project', String(p.id)], p);
      onClose();
      if (!project) navigate(`/projects/${p.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Client yang sudah nonaktif tetap ditampilkan kalau sedang dipakai project ini.
  const clientOptions = clients.data ?? [];
  const missingClient = project && !clientOptions.some((c) => c.id === project.clientId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{project ? `Ubah Project ${project.code}` : 'Project Baru'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="pj-name">
              Nama project<span className="text-destructive">*</span>
            </Label>
            <Input id="pj-name" required autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="contoh: Pengadaan Laptop Sekolah 2026" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pj-client">
                Client / Dinas / Instansi<span className="text-destructive">*</span>
              </Label>
              <NativeSelect id="pj-client" required value={f.clientId} onChange={(e) => set('clientId', e.target.value)}>
                <option value="">Pilih client…</option>
                {missingClient && <option value={project.clientId}>{project.clientName}</option>}
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              {clientOptions.length === 0 && <p className="text-xs text-muted-foreground">Belum ada client. Tambahkan dulu di Master Data → Client.</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pj-po">No. PO / Kontrak / SPK</Label>
              <Input id="pj-po" value={f.poNumber} onChange={(e) => set('poNumber', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pj-date">Target selesai (deadline)</Label>
              <Input id="pj-date" type="date" value={f.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pj-pic">PIC</Label>
              <NativeSelect id="pj-pic" value={f.picUserId} onChange={(e) => set('picUserId', e.target.value)}>
                <option value="">—</option>
                {users.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-addr">Alamat pengiriman</Label>
            <Textarea id="pj-addr" value={f.shippingAddress} onChange={(e) => set('shippingAddress', e.target.value)} />
          </div>

          <fieldset className="grid gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Mode QC</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {Object.entries(QC_MODE_LABELS).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name="qcMode" value={v} checked={f.qcMode === v} onChange={() => set('qcMode', v)} />
                  {l}
                </label>
              ))}
            </div>
            {f.qcMode === 'sampling' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label htmlFor="pj-lot" className="text-xs">
                    Ukuran lot (unit)
                  </Label>
                  <Input id="pj-lot" type="number" min={1} value={f.lotSize} onChange={(e) => set('lotSize', e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="pj-pct" className="text-xs">
                    Sampel (%)
                  </Label>
                  <Input id="pj-pct" type="number" min={0.1} max={100} step={0.1} value={f.samplePercent} onChange={(e) => set('samplePercent', e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="pj-fail" className="text-xs">
                    Batas sampel gagal
                  </Label>
                  <Input id="pj-fail" type="number" min={0} value={f.maxSampleFail} onChange={(e) => set('maxSampleFail', e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Contoh: lot 500 unit, sampel 5% = 25 unit di-QC per lot. Kalau sampel yang gagal lebih dari batas, seluruh lot ditahan untuk diperiksa.
                </p>
              </div>
            )}
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="pj-notes">Catatan</Label>
            <Textarea id="pj-notes" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
