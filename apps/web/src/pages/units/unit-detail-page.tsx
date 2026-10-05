import {
  canManageProjects,
  canWorkStage,
  STAGE_LABELS,
  UNIT_STATUS_LABELS,
  workResultLabel,
  type QcFormDto,
  type Stage,
  type UnitDetailDto,
  type UnitFieldDto,
} from '@manpro/shared';
import { PhotoGallery } from '@/components/photo-gallery';
import { QcHistory } from '@/pages/work/qc-panel';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Eye, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { UnitStatusBadge } from '@/components/unit-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function UnitDetailPage() {
  const { id } = useParams();
  const unit = useQuery({ queryKey: ['unit', id], queryFn: () => api<UnitDetailDto>(`/api/units/${id}`) });
  if (unit.isLoading) return <p className="text-muted-foreground">Memuat…</p>;
  if (!unit.data) return <p className="text-destructive">{errorMessage(unit.error)}</p>;
  return <UnitDetail key={unit.data.id} u={unit.data} />;
}


function UnitDetail({ u }: { u: UnitDetailDto }) {
  const me = useMe().data!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = canManageProjects(me) || (u.status !== 'completed' && canWorkStage(me, u.status as Stage));
  const current = u.stages.indexOf(u.status as Stage);

  const remove = useMutation({
    mutationFn: () => api(`/api/units/${u.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Unit dihapus');
      queryClient.invalidateQueries({ queryKey: ['project', String(u.projectId)] });
      navigate(`/projects/${u.projectId}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-4">
      <div>
        <Link to={`/projects/${u.projectId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {u.projectCode} · {u.projectName}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold">{u.serialNumber}</h1>
          <UnitStatusBadge status={u.status} />
          <span className="text-sm text-muted-foreground">{u.itemLabel}</span>
          {canManageProjects(me) && u.logs.length === 1 && (
            <Button variant="outline" size="sm" className="ml-auto" disabled={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 /> Hapus unit (salah input)
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alur Tahapan</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {u.stages.map((s, i) => {
              const done = u.status === 'completed' || i < current;
              const active = i === current;
              return (
                <li key={s} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-3 py-1',
                      done && 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                      active && 'border-primary bg-primary text-primary-foreground',
                    )}
                  >
                    {done && <Check className="size-3.5" />}
                    {STAGE_LABELS[s]}
                  </span>
                  {i < u.stages.length - 1 && <span className="text-muted-foreground">→</span>}
                </li>
              );
            })}
            <li className="flex items-center gap-2">
              <span className="text-muted-foreground">→</span>
              <span className={cn('rounded-full border px-3 py-1', u.status === 'completed' && 'border-emerald-600 bg-emerald-600 text-white')}>Selesai</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      <WarrantyCard u={u} />

      <div className="grid gap-4 lg:grid-cols-2">
        {u.fields.length > 0 && <FieldsCard u={u} canEdit={canEdit} />}
        <AccessoriesCard u={u} canEdit={canEdit} />
      </div>

      <QcHistoryCard unitId={u.id} />

      <Card>
        <CardHeader>
          <CardTitle>Foto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <PhotoGallery entityType="unit" entityId={u.id} category="foto" canUpload title="Foto unit" />
          <PhotoGallery entityType="unit" entityId={u.id} category="qc" canUpload={false} title="Foto QC" />
          {u.installations.length > 0 && <PhotoGallery entityType="installation" entityId={u.id} canUpload={canWorkStage(me, 'installation')} title="Foto instalasi" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 border-l pl-4">
            {u.logs.map((l) => (
              <li key={l.id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary" />
                <div>
                  <b>{workResultLabel(l.action, l.fromStatus, l.toStatus)}</b>
                  {l.fromStatus ? ` · ${UNIT_STATUS_LABELS[l.fromStatus]} → ` : ' · '}
                  {UNIT_STATUS_LABELS[l.toStatus]}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(l.createdAt)} · {l.userName ?? 'sistem'}
                </div>
                {l.note && <div className="mt-1 rounded bg-muted px-2 py-1 text-xs">{l.note}</div>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{children || '—'}</span>
    </div>
  );
}

/** Ringkasan lengkap unit untuk pelacakan garansi. */
function WarrantyCard({ u }: { u: UnitDetailDto }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Informasi Unit</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Client">{u.clientName}</Row>
          <Row label="Vendor / prinsipal">{u.vendorName}</Row>
          <Row label="Produk">{u.itemLabel}</Row>
          <Row label="Koli">{u.package && <span className="font-mono">{u.package.code}</span>}</Row>
          <Row label="Surat jalan">
            {u.shipment && (
              <>
                <span className="font-mono">{u.shipment.code}</span>
                {u.shipment.courierName && ` · ${u.shipment.courierName}`}
                {u.shipment.trackingNumber && ` · resi ${u.shipment.trackingNumber}`}
              </>
            )}
          </Row>
          <Row label="Dikirim">{u.shipment?.shippedAt && formatDateTime(u.shipment.shippedAt)}</Row>
          <Row label="Diterima">
            {u.shipment?.receivedAt && `${formatDateTime(u.shipment.receivedAt)} · ${u.shipment.receivedByName}`}
          </Row>
          {u.installations.map((i) => (
            <Row key={i.id} label="Instalasi">
              {i.location} · {formatDateTime(i.createdAt)} · {i.installedByName}
            </Row>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Komponen & Aktivasi</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div>
            {u.components.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada komponen tercatat.</p>}
            {u.components.map((c) => (
              <Row key={c.id} label={c.categoryName}>
                {c.brand} {c.model}
                {c.serialNumber && <span className="font-mono text-muted-foreground"> · {c.serialNumber}</span>}
              </Row>
            ))}
          </div>
          <div>
            {u.activations.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada aktivasi tercatat.</p>}
            {u.activations.map((a) => (
              <Row key={a.id} label={a.targetName}>
                {a.softwareVersion && `${a.softwareVersion} · `}
                {a.maskedKey && <span className="font-mono text-xs">{a.maskedKey}</span>}
                {a.result === 'failed' && <span className="text-destructive"> · GAGAL</span>}
              </Row>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QcHistoryCard({ unitId }: { unitId: string }) {
  const form = useQuery({ queryKey: ['qc-form', unitId], queryFn: () => api<QcFormDto>(`/api/qc/units/${unitId}`) });
  if (!form.data?.history.length) return null;
  return (
    <Card>
      <CardContent>
        <QcHistory items={form.data.history} />
      </CardContent>
    </Card>
  );
}

function FieldsCard({ u, canEdit }: { u: UnitDetailDto; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(u.fields.filter((f) => !f.isSecret).map((f) => [f.key, f.value === null ? '' : String(f.value)])),
  );
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => api<UnitDetailDto>(`/api/units/${u.id}/fields`, { method: 'PUT', body: { customFields: values } }),
    onSuccess: (d) => {
      toast.success('Data unit disimpan');
      queryClient.setQueryData(['unit', String(u.id)], d);
      setRevealed({});
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reveal = useMutation({
    mutationFn: (key: string) => api<{ value: string | null }>(`/api/units/${u.id}/fields/${key}/reveal`, { method: 'POST' }),
    onSuccess: (r, key) => {
      setRevealed((x) => ({ ...x, [key]: r.value ?? '' }));
      setValues((x) => ({ ...x, [key]: r.value ?? '' }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const input = (f: UnitFieldDto) => {
    const v = values[f.key] ?? '';
    const onChange = (val: string) => setValues((x) => ({ ...x, [f.key]: val }));
    if (f.isSecret && !(f.key in revealed) && !(f.key in values)) {
      return (
        <div className="flex items-center gap-2">
          <Input disabled value={f.hasValue ? '••••••••' : ''} placeholder="(kosong)" />
          {f.hasValue && (
            <Button type="button" variant="outline" size="sm" onClick={() => reveal.mutate(f.key)} title="Setiap kali dibuka akan tercatat">
              <Eye /> Lihat
            </Button>
          )}
          {!f.hasValue && canEdit && (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange('')}>
              Isi
            </Button>
          )}
        </div>
      );
    }
    if (f.inputType === 'select') {
      return (
        <NativeSelect disabled={!canEdit} value={v} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
      );
    }
    return (
      <Input
        disabled={!canEdit}
        type={f.inputType === 'number' ? 'number' : f.inputType === 'date' ? 'date' : 'text'}
        className={f.inputType === 'serial' ? 'font-mono' : ''}
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Tambahan</CardTitle>
        <CardDescription>Kolom khusus jenis produk. Kolom rahasia disimpan terenkripsi dan setiap kali dibuka tercatat.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {u.fields.map((f) => (
            <div key={f.key} className="grid gap-1">
              <Label className="text-xs">
                {f.label}
                {f.isRequired && <span className="text-destructive">*</span>}
                {f.isSecret && <span className="text-muted-foreground"> (rahasia)</span>}
              </Label>
              {input(f)}
            </div>
          ))}
          {canEdit && (
            <Button type="submit" className="justify-self-start" disabled={save.isPending}>
              Simpan
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function AccessoriesCard({ u, canEdit }: { u: UnitDetailDto; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(u.expectedAccessories.find((a) => !u.accessories.some((x) => x.name === a)) ?? '');
  const [sn, setSn] = useState('');
  const onDone = (d: UnitDetailDto) => queryClient.setQueryData(['unit', String(u.id)], d);

  const add = useMutation({
    mutationFn: () => api<UnitDetailDto>(`/api/units/${u.id}/accessories`, { method: 'POST', body: { name, serialNumber: sn } }),
    onSuccess: (d) => {
      onDone(d);
      setSn('');
      setName(d.expectedAccessories.find((a) => !d.accessories.some((x) => x.name === a)) ?? '');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (accId: number) => api<UnitDetailDto>(`/api/units/${u.id}/accessories/${accId}`, { method: 'DELETE' }),
    onSuccess: onDone,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const missing = u.expectedAccessories.filter((a) => !u.accessories.some((x) => x.name === a));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kelengkapan</CardTitle>
        <CardDescription>
          {u.expectedAccessories.length ? `Wajib: ${u.expectedAccessories.join(', ')}.` : 'Tidak ada kelengkapan wajib untuk item ini.'}
          {missing.length > 0 && <span className="text-orange-600"> Belum ada: {missing.join(', ')}.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {u.accessories.length === 0 && <p className="text-sm text-muted-foreground">Belum ada kelengkapan tercatat.</p>}
        {u.accessories.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>
              {a.name} {a.serialNumber && <span className="font-mono text-muted-foreground">· {a.serialNumber}</span>}
            </span>
            {canEdit && (
              <Button variant="ghost" size="icon-sm" tooltip="Hapus kelengkapan" onClick={() => remove.mutate(a.id)}>
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <Input className="w-40" required placeholder="Nama (mis. Monitor)" value={name} onChange={(e) => setName(e.target.value)} list="acc-names" />
            <datalist id="acc-names">
              {u.expectedAccessories.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <Input className="w-48 font-mono" placeholder="SN (scan)" value={sn} onChange={(e) => setSn(e.target.value)} />
            <Button type="submit" variant="outline" disabled={add.isPending}>
              <Plus /> Tambah
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
