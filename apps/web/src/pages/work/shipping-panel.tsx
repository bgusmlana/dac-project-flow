import { SHIPMENT_STATUS_LABELS, type MasterDto, type ShipmentDetailDto, type ShipmentSummaryDto } from '@manpro/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Plus, Printer, ScanLine, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { PhotoGallery } from '@/components/photo-gallery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInvalidateWork } from '@/hooks/use-invalidate-work';
import { useMasterOptions } from '@/hooks/use-options';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { BulkPanelProps } from './stage-panels';

const VARIANT = { preparing: 'outline', shipped: 'default', delivered: 'secondary' } as const;

export function ShippingPanel({ projectId }: BulkPanelProps) {
  const invalidate = useInvalidateWork();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['shipments', projectId],
    queryFn: () => api<ShipmentSummaryDto[]>(`/api/shipments?projectId=${projectId}`),
    enabled: !!projectId,
  });
  const create = useMutation({
    mutationFn: () => api<ShipmentDetailDto>(`/api/projects/${projectId}/shipments`, { method: 'POST' }),
    onSuccess: (s) => {
      toast.success(`Pengiriman ${s.code} dibuat`);
      invalidate();
      setOpenId(s.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!projectId) return <p className="rounded-lg border bg-muted/40 p-3 text-sm">Pilih project pada filter antrian di bawah untuk mengelola pengiriman.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengiriman</CardTitle>
        <CardDescription>Satu pengiriman = satu surat jalan. Scan koli tersegel, catat ekspedisi & resi, lalu konfirmasi diterima (BAST).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button className="justify-self-start" disabled={create.isPending} onClick={() => create.mutate()}>
          <Plus /> Pengiriman Baru
        </Button>
        {openId && <ShipmentEditor key={openId} shipmentId={openId} onClose={() => setOpenId(null)} />}
        {list.data
          ?.filter((s) => s.id !== openId)
          .map((s) => (
            <button key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setOpenId(s.id)}>
              <span>
                <b className="font-mono">{s.code}</b> · {formatNumber(s.packageCount)} koli, {formatNumber(s.unitCount)} unit
                {s.courierName && ` · ${s.courierName}`}
                {s.trackingNumber && ` · resi ${s.trackingNumber}`}
              </span>
              <Badge variant={VARIANT[s.status]}>{SHIPMENT_STATUS_LABELS[s.status]}</Badge>
            </button>
          ))}
      </CardContent>
    </Card>
  );
}

function ShipmentEditor({ shipmentId, onClose }: { shipmentId: string; onClose: () => void }) {
  const invalidate = useInvalidateWork();
  const couriers = useMasterOptions<MasterDto & { name: string }>('couriers');
  const [scan, setScan] = useState('');
  const [errors, setErrors] = useState<{ code: string; message: string }[]>([]);
  const [courierId, setCourierId] = useState('');
  const [tracking, setTracking] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [receiver, setReceiver] = useState('');
  const s = useQuery({ queryKey: ['shipments', 'detail', shipmentId], queryFn: () => api<ShipmentDetailDto>(`/api/shipments/${shipmentId}`) });

  const refresh = () => {
    invalidate();
    s.refetch();
  };
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const add = useMutation({
    mutationFn: (codes: string[]) => api<{ errors: { code: string; message: string }[] }>(`/api/shipments/${shipmentId}/packages`, { method: 'POST', body: { codes } }),
    onSuccess: (r) => {
      setErrors(r.errors);
      refresh();
    },
    onError,
  });
  const removePkg = useMutation({ mutationFn: (pid: string) => api(`/api/shipments/${shipmentId}/packages/${pid}`, { method: 'DELETE' }), onSuccess: refresh, onError });
  const ship = useMutation({
    mutationFn: () => api(`/api/shipments/${shipmentId}/ship`, { method: 'POST', body: { courierId: Number(courierId), trackingNumber: tracking, vehicleInfo: vehicle } }),
    onSuccess: () => {
      toast.success('Barang dikirim');
      refresh();
    },
    onError,
  });
  const deliver = useMutation({
    mutationFn: () => api(`/api/shipments/${shipmentId}/deliver`, { method: 'POST', body: { receivedByName: receiver } }),
    onSuccess: () => {
      toast.success('Pengiriman diterima client');
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/shipments/${shipmentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError,
  });

  const d = s.data;
  if (!d) return <p className="text-sm text-muted-foreground">Memuat…</p>;

  return (
    <div className="grid gap-3 rounded-lg border-2 border-primary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-mono text-lg">{d.code}</b>
        <Badge variant={VARIANT[d.status]}>{SHIPMENT_STATUS_LABELS[d.status]}</Badge>
        <span className="text-sm text-muted-foreground">
          {formatNumber(d.packageCount)} koli · {formatNumber(d.unitCount)} unit
        </span>
        <div className="ml-auto flex gap-1">
          <Button variant="outline" size="sm" onClick={() => window.open(`/print/shipment/${d.id}`, '_blank')}>
            <Printer /> Surat Jalan
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>

      {d.status === 'preparing' && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const codes = scan.split(/[\s,;]+/).filter(Boolean);
            if (codes.length) add.mutate(codes);
            setScan('');
          }}
        >
          <div className="relative w-full max-w-md">
            <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus className="pl-8 font-mono" placeholder="Scan kode koli…" value={scan} onChange={(e) => setScan(e.target.value)} />
          </div>
          <Button type="submit" variant="outline">
            Tambah
          </Button>
        </form>
      )}
      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-sm">
          {errors.map((e) => (
            <div key={e.code}>
              <span className="font-mono">{e.code}</span>: {e.message}
            </div>
          ))}
        </div>
      )}
      <div className="rounded-lg border">
        {d.packages.length === 0 && <p className="p-3 text-sm text-muted-foreground">Belum ada koli.</p>}
        {d.packages.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b px-3 py-1.5 text-sm last:border-b-0">
            <span>
              <span className="font-mono">{p.code}</span> · {formatNumber(p.unitCount)} unit{p.weightKg ? ` · ${p.weightKg} kg` : ''}
            </span>
            {d.status === 'preparing' && (
              <Button variant="ghost" size="icon-sm" tooltip="Keluarkan koli dari pengiriman" onClick={() => removePkg.mutate(p.id)}>
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
      </div>

      {d.status === 'preparing' && (
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4 sm:items-end">
          <div className="grid gap-1">
            <Label className="text-xs">Ekspedisi</Label>
            <NativeSelect value={courierId} onChange={(e) => setCourierId(e.target.value)}>
              <option value="">Pilih…</option>
              {couriers.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">No. resi</Label>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Kendaraan / sopir (opsional)</Label>
            <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
          </div>
          <Button disabled={!courierId || d.packageCount === 0 || ship.isPending} onClick={() => ship.mutate()}>
            <Truck /> Kirim
          </Button>
          {d.packageCount === 0 && (
            <Button variant="ghost" className="sm:col-span-4 sm:justify-self-start" onClick={() => remove.mutate()}>
              <Trash2 /> Hapus pengiriman kosong
            </Button>
          )}
        </div>
      )}

      {d.status !== 'preparing' && (
        <p className="text-sm">
          Dikirim {formatDateTime(d.shippedAt)} via <b>{d.courierName}</b>
          {d.trackingNumber && ` · resi ${d.trackingNumber}`}
          {d.vehicleInfo && ` · ${d.vehicleInfo}`}
          {d.status === 'delivered' && (
            <>
              <br />
              Diterima {formatDateTime(d.receivedAt)} oleh <b>{d.receivedByName}</b>
            </>
          )}
        </p>
      )}

      {d.status === 'shipped' && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
          <div className="grid flex-1 gap-1">
            <Label className="text-xs">Nama penerima (BAST)</Label>
            <Input value={receiver} onChange={(e) => setReceiver(e.target.value)} />
          </div>
          <Button disabled={!receiver.trim() || deliver.isPending} onClick={() => deliver.mutate()}>
            <CheckCircle2 /> Konfirmasi Diterima
          </Button>
        </div>
      )}

      {d.status !== 'preparing' && <PhotoGallery entityType="shipment" entityId={d.id} category="bast" canUpload title="Foto pengiriman & BAST" />}
    </div>
  );
}
