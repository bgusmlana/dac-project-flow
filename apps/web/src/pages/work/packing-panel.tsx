import { PACKAGE_STATUS_LABELS, type PackageDetailDto, type PackageSummaryDto, type PackResultDto } from '@manpro/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Lock, LockOpen, PackagePlus, Printer, ScanLine, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PhotoGallery } from '@/components/photo-gallery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useInvalidateWork } from '@/hooks/use-invalidate-work';
import { api, errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { BulkPanelProps } from './stage-panels';

export function PackingPanel({ projectId }: BulkPanelProps) {
  const invalidate = useInvalidateWork();
  const [openId, setOpenId] = useState<string | null>(null);
  const packages = useQuery({
    queryKey: ['packages', projectId],
    queryFn: () => api<PackageSummaryDto[]>(`/api/projects/${projectId}/packages`),
    enabled: !!projectId,
  });
  const create = useMutation({
    mutationFn: () => api<PackageDetailDto>(`/api/projects/${projectId}/packages`, { method: 'POST' }),
    onSuccess: (p) => {
      toast.success(`Koli ${p.code} dibuat`);
      invalidate();
      setOpenId(p.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!projectId) {
    return <p className="rounded-lg border bg-muted/40 p-3 text-sm">Pilih project pada filter antrian di bawah untuk mulai packing.</p>;
  }
  const open = packages.data?.filter((p) => p.status === 'open') ?? [];
  const sealed = packages.data?.filter((p) => p.status !== 'open') ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Koli / Dus</CardTitle>
        <CardDescription>Buat koli, scan unit ke dalamnya, lalu segel. Unit dalam koli tersegel lanjut ke tahap Pengiriman.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button className="justify-self-start" disabled={create.isPending} onClick={() => create.mutate()}>
          <PackagePlus /> Koli Baru
        </Button>
        {openId && <PackageEditor key={openId} packageId={openId} onClose={() => setOpenId(null)} />}
        {[...open, ...sealed]
          .filter((p) => p.id !== openId)
          .map((p) => (
            <button key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setOpenId(p.id)}>
              <span>
                <b className="font-mono">{p.code}</b> · {formatNumber(p.unitCount)} unit{p.weightKg ? ` · ${p.weightKg} kg` : ''}
                {p.shipmentCode && <span className="text-muted-foreground"> · {p.shipmentCode}</span>}
              </span>
              <Badge variant={p.status === 'open' ? 'outline' : 'secondary'}>{PACKAGE_STATUS_LABELS[p.status]}</Badge>
            </button>
          ))}
      </CardContent>
    </Card>
  );
}

function PackageEditor({ packageId, onClose }: { packageId: string; onClose: () => void }) {
  const invalidate = useInvalidateWork();
  const scanRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState('');
  const [weight, setWeight] = useState('');
  const [errors, setErrors] = useState<PackResultDto['errors']>([]);
  const pkg = useQuery({ queryKey: ['packages', 'detail', packageId], queryFn: () => api<PackageDetailDto>(`/api/packages/${packageId}`) });

  const refresh = () => {
    invalidate();
    pkg.refetch();
  };
  const pack = useMutation({
    mutationFn: (serialNumbers: string[]) => api<PackResultDto>(`/api/packages/${packageId}/units`, { method: 'POST', body: { serialNumbers } }),
    onSuccess: (r) => {
      setErrors(r.errors);
      if (r.added) toast.success(`${r.added} unit masuk koli`);
      refresh();
      scanRef.current?.focus();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unpack = useMutation({
    mutationFn: (unitId: string) => api(`/api/packages/${packageId}/units/${unitId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const seal = useMutation({
    mutationFn: () => api(`/api/packages/${packageId}/seal`, { method: 'POST', body: { weightKg: weight || null } }),
    onSuccess: () => {
      toast.success('Koli disegel');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unseal = useMutation({
    mutationFn: () => api(`/api/packages/${packageId}/unseal`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/packages/${packageId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const p = pkg.data;
  if (!p) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  const isOpen = p.status === 'open';

  return (
    <div className="grid gap-3 rounded-lg border-2 border-primary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-mono text-lg">{p.code}</b>
        <Badge variant={isOpen ? 'outline' : 'secondary'}>{PACKAGE_STATUS_LABELS[p.status]}</Badge>
        <span className="text-sm text-muted-foreground">{formatNumber(p.unitCount)} unit</span>
        <div className="ml-auto flex gap-1">
          <Button variant="outline" size="sm" onClick={() => window.open(`/print/package/${p.id}`, '_blank')}>
            <Printer /> Label & Packing List
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>

      {isOpen && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const sns = scan.split(/[\s,;]+/).filter(Boolean);
            if (sns.length) pack.mutate(sns);
            setScan('');
          }}
        >
          <div className="relative w-full max-w-md">
            <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={scanRef} autoFocus className="pl-8 font-mono" placeholder="Scan SN unit untuk dimasukkan ke koli…" value={scan} onChange={(e) => setScan(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={pack.isPending}>
            Masukkan
          </Button>
        </form>
      )}
      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-sm">
          {errors.map((e) => (
            <div key={e.serialNumber}>
              <span className="font-mono">{e.serialNumber}</span>: {e.message}
            </div>
          ))}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto rounded-lg border">
        {p.units.length === 0 && <p className="p-3 text-sm text-muted-foreground">Koli masih kosong.</p>}
        {p.units.map((u, i) => (
          <div key={u.id} className="flex items-center justify-between border-b px-3 py-1.5 text-sm last:border-b-0">
            <span>
              {i + 1}. <span className="font-mono">{u.serialNumber}</span> <span className="text-muted-foreground">· {u.itemLabel}</span>
              {u.accessories.length > 0 && <span className="text-xs text-muted-foreground"> · +{u.accessories.map((a) => a.name).join(', ')}</span>}
            </span>
            {isOpen && (
              <Button variant="ghost" size="icon-sm" tooltip="Keluarkan dari koli" onClick={() => unpack.mutate(u.id)}>
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
      </div>

      <PhotoGallery entityType="package" entityId={p.id} canUpload title="Foto packing" />

      <div className="flex flex-wrap items-center gap-2">
        {isOpen ? (
          <>
            <Input className="w-32" type="number" step="0.1" min={0} placeholder="Berat (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <Button disabled={p.unitCount === 0 || seal.isPending} onClick={() => seal.mutate()}>
              <Lock /> Segel Koli
            </Button>
            {p.unitCount === 0 && (
              <Button variant="ghost" onClick={() => remove.mutate()}>
                <Trash2 /> Hapus koli kosong
              </Button>
            )}
          </>
        ) : (
          p.status === 'sealed' &&
          !p.shipmentId && (
            <Button variant="outline" disabled={unseal.isPending} onClick={() => unseal.mutate()}>
              <LockOpen /> Buka segel (salah packing)
            </Button>
          )
        )}
      </div>
    </div>
  );
}
