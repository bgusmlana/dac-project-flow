import type { ImportJobDto, ProjectItemDto } from '@manpro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui-extra';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';

function ItemSelect({ items, value, onChange }: { items: ProjectItemDto[]; value: string; onChange: (v: string) => void }) {
  return (
    <NativeSelect required value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pilih item…</option>
      {items.map((i) => (
        <option key={i.id} value={i.id} disabled={i.unitCount >= i.quantity}>
          {i.brand} {i.model} — {formatNumber(i.unitCount)}/{formatNumber(i.quantity)} unit
          {i.unitCount >= i.quantity ? ' (penuh)' : ''}
        </option>
      ))}
    </NativeSelect>
  );
}

function ErrorList({ errors, label }: { errors: { row: number; message: string }[]; label: string }) {
  if (errors.length === 0) return null;
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium text-destructive">
        {formatNumber(errors.length)} {label} gagal:
      </p>
      <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted/40 p-2 font-mono text-xs">
        {errors.map((e, i) => (
          <div key={i}>
            Baris {e.row}: {e.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tambah unit dengan scan barcode / tempel daftar SN (satu per baris). */
export function AddUnitsDialog({ projectId, items, onClose }: { projectId: string; items: ProjectItemDto[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState(items.length === 1 ? String(items[0]!.id) : '');
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ inserted: number; errors: { row: number; message: string }[] } | null>(null);
  const serials = text.split(/[\r\n,;\t]+/).map((s) => s.trim()).filter(Boolean);

  const add = useMutation({
    mutationFn: () =>
      api<{ inserted: number; errors: { row: number; message: string }[] }>(`/api/projects/${projectId}/items/${itemId}/units`, {
        method: 'POST',
        body: { serialNumbers: serials },
      }),
    onSuccess: (r) => {
      setResult(r);
      if (r.inserted) toast.success(`${formatNumber(r.inserted)} unit ditambahkan`);
      if (r.errors.length === 0) setText('');
      queryClient.invalidateQueries({ queryKey: ['project', String(projectId)] });
      queryClient.invalidateQueries({ queryKey: ['units', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Tambah Unit</DialogTitle>
            <DialogDescription>Scan barcode serial number satu per satu (setiap scan otomatis pindah baris), atau tempel daftar SN dari Excel.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Item</Label>
            <ItemSelect items={items} value={itemId} onChange={setItemId} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sn-list">Serial number</Label>
            <Textarea id="sn-list" autoFocus className="min-h-48 font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={'SN001\nSN002\nSN003'} />
            <p className="text-xs text-muted-foreground">{formatNumber(serials.length)} serial number. Maksimal 5.000 sekali simpan; lebih dari itu pakai Import Excel.</p>
          </div>
          {result && <ErrorList errors={result.errors} label="baris" />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Tutup
            </Button>
            <Button type="submit" disabled={!itemId || serials.length === 0 || add.isPending}>
              {add.isPending ? 'Menyimpan…' : `Simpan ${formatNumber(serials.length)} Unit`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Status proses import, diperbarui otomatis selama masih berjalan. */
export function ImportJobStatus({ jobId }: { jobId: number }) {
  const queryClient = useQueryClient();
  const job = useQuery({
    queryKey: ['import', jobId],
    queryFn: async () => {
      const j = await api<ImportJobDto>(`/api/imports/${jobId}`);
      if (j.status === 'done' || j.status === 'failed') {
        queryClient.invalidateQueries({ queryKey: ['project'] });
        queryClient.invalidateQueries({ queryKey: ['units'] });
      }
      return j;
    },
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'failed') ? false : 1000),
  });
  const j = job.data;
  if (!j) return <p className="text-sm text-muted-foreground">Memuat status…</p>;
  const pct = j.totalRows ? Math.round((j.processedRows / j.totalRows) * 100) : 0;
  return (
    <div className="grid gap-2 rounded-lg border p-3 text-sm">
      <div className="flex justify-between">
        <span className="font-medium">{j.fileName}</span>
        <span>
          {j.status === 'queued' && 'Menunggu antrian…'}
          {j.status === 'processing' && `Memproses… ${pct}%`}
          {j.status === 'done' && 'Selesai'}
          {j.status === 'failed' && <span className="text-destructive">Gagal</span>}
        </span>
      </div>
      {(j.status === 'processing' || j.status === 'queued') && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {j.status === 'done' && (
        <p>
          <b className="text-emerald-700">{formatNumber(j.successRows)}</b> unit berhasil masuk dari {formatNumber(j.totalRows)} baris
          {j.failedRows > 0 && (
            <>
              , <b className="text-destructive">{formatNumber(j.failedRows)}</b> gagal
            </>
          )}
          .
        </p>
      )}
      {j.message && <p className={j.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{j.message}</p>}
      <ErrorList errors={j.errors} label="baris" />
    </div>
  );
}

export function ImportUnitsDialog({ projectId, items, onClose }: { projectId: string; items: ProjectItemDto[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState(items.length === 1 ? String(items[0]!.id) : '');
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);

  const upload = useMutation({
    mutationFn: () => apiUpload<ImportJobDto>(`/api/projects/${projectId}/items/${itemId}/import`, file!),
    onSuccess: (j) => {
      setJobId(j.id);
      queryClient.invalidateQueries({ queryKey: ['imports', projectId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Unit dari Excel</DialogTitle>
          <DialogDescription>Untuk project besar (ribuan unit). File diproses di latar belakang; dialog ini boleh ditutup.</DialogDescription>
        </DialogHeader>
        {jobId ? (
          <ImportJobStatus jobId={jobId} />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>1. Pilih item</Label>
              <ItemSelect items={items} value={itemId} onChange={setItemId} />
            </div>
            <div className="grid gap-2">
              <Label>2. Unduh template & isi serial number</Label>
              <Button
                type="button"
                variant="outline"
                disabled={!itemId}
                className="justify-self-start"
                onClick={() => window.open(`/api/projects/${projectId}/items/${itemId}/import-template`, '_blank')}
              >
                <Download /> Unduh Template Excel
              </Button>
              <p className="text-xs text-muted-foreground">Bisa juga file .csv dengan kolom pertama bernama serial_number.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="imp-file">3. Upload file</Label>
              <input id="imp-file" type="file" accept=".xlsx,.csv" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
          {!jobId && (
            <Button disabled={!itemId || !file || upload.isPending} onClick={() => upload.mutate()}>
              <Upload /> {upload.isPending ? 'Mengunggah…' : 'Mulai Import'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
