import {
  canConfigureProductTypes,
  CUSTOM_FIELD_TYPE_LABELS,
  QC_ITEM_TYPE_LABELS,
  STAGE_LABELS,
  STAGE_REQUIREMENT_LABELS,
  type CustomFieldType,
  type MasterDto,
  type Paginated,
  type ProductTypeDetailDto,
  type QcItemType,
  type StageRequirement,
} from '@manpro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { ToggleActiveDialog } from '@/components/status-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';

export function ProductTypeDetailPage() {
  const { id } = useParams();
  const detail = useQuery({
    queryKey: ['product-type', id],
    queryFn: () => api<ProductTypeDetailDto>(`/api/product-types/${id}`),
  });

  if (detail.isLoading) return <p className="text-muted-foreground">Memuat…</p>;
  if (detail.isError || !detail.data) return <p className="text-destructive">{errorMessage(detail.error)}</p>;
  return <ProductTypeEditor key={detail.data.id} data={detail.data} />;
}

/** Simpan salah satu bagian pengaturan lalu perbarui cache. */
function useSave(id: number, path: string, successMessage: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api<ProductTypeDetailDto>(`/api/product-types/${id}${path}`, { method: 'PUT', body }),
    onSuccess: (data) => {
      toast.success(successMessage);
      queryClient.setQueryData(['product-type', String(id)], data);
      queryClient.invalidateQueries({ queryKey: ['product-types'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function ProductTypeEditor({ data }: { data: ProductTypeDetailDto }) {
  const me = useMe().data!;
  const canEdit = canConfigureProductTypes(me);
  const queryClient = useQueryClient();
  const [toggling, setToggling] = useState(false);

  const toggle = useMutation({
    mutationFn: () => api<ProductTypeDetailDto>(`/api/product-types/${data.id}/active`, { method: 'PATCH', body: { isActive: !data.isActive } }),
    onSuccess: (d) => {
      toast.success('Status berhasil diubah');
      queryClient.setQueryData(['product-type', String(data.id)], d);
      queryClient.invalidateQueries({ queryKey: ['product-types'] });
      setToggling(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-4">
      <div>
        <Link to="/master/product-types" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Jenis Produk
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{data.name}</h1>
          <span className="font-mono text-sm text-muted-foreground">{data.code}</span>
          {data.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}
          <span className="text-sm text-muted-foreground">· {data.productCount} produk di katalog</span>
          {canEdit && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setToggling(true)}>
              {data.isActive ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          )}
        </div>
        {!canEdit && <p className="mt-2 text-sm text-muted-foreground">Hanya Super Admin dan Manager yang bisa mengubah pengaturan ini.</p>}
      </div>

      {/* key: setiap bagian direset hanya ketika datanya sendiri berubah di server,
          supaya perubahan yang belum disimpan di bagian lain tidak hilang. */}
      <GeneralSection
        key={JSON.stringify([data.name, data.code, data.stages, data.componentCategoryIds, data.activationTypeIds])}
        data={data}
        canEdit={canEdit}
      />
      <CustomFieldsSection key={JSON.stringify(data.customFields)} data={data} canEdit={canEdit} />
      <QcTemplateSection key={data.qcTemplate?.id ?? 0} data={data} canEdit={canEdit} />

      {toggling && (
        <ToggleActiveDialog
          name={data.name}
          isActive={data.isActive}
          pending={toggle.isPending}
          onConfirm={() => toggle.mutate()}
          onClose={() => setToggling(false)}
        />
      )}
    </div>
  );
}

function useMasterOptions(kind: 'component-categories' | 'activation-types') {
  return useQuery({
    queryKey: ['master', kind, 'options'],
    queryFn: () => api<Paginated<MasterDto>>(`/api/master/${kind}?pageSize=500&includeInactive=true`),
  });
}

function GeneralSection({ data, canEdit }: { data: ProductTypeDetailDto; canEdit: boolean }) {
  const [name, setName] = useState(data.name);
  const [code, setCode] = useState(data.code);
  const [stages, setStages] = useState(data.stages);
  const [components, setComponents] = useState(new Set(data.componentCategoryIds));
  const [activations, setActivations] = useState(new Set(data.activationTypeIds));
  const compOptions = useMasterOptions('component-categories');
  const actOptions = useMasterOptions('activation-types');
  const save = useSave(data.id, '', 'Pengaturan jenis produk disimpan');

  const toggleIn = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengaturan Umum</CardTitle>
        <CardDescription>Tahapan kerja yang dilalui setiap unit dari jenis produk ini.</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="g-name">Nama</Label>
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="g-code">Kode</Label>
              <Input id="g-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Tahapan</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stages.map((s, i) => (
                <div key={s.stage} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="text-sm">
                    {i + 1}. {STAGE_LABELS[s.stage]}
                  </span>
                  <NativeSelect
                    aria-label={`Tahap ${STAGE_LABELS[s.stage]}`}
                    className="w-32"
                    value={s.requirement}
                    disabled={s.stage === 'shipping'}
                    onChange={(e) =>
                      setStages((all) => all.map((x) => (x.stage === s.stage ? { ...x, requirement: e.target.value as StageRequirement } : x)))
                    }
                  >
                    {Object.entries(STAGE_REQUIREMENT_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Ekspedisi selalu wajib. Tahap yang dilewati tidak akan muncul untuk unit jenis ini.</p>
          </div>

          <CheckboxGroup
            label="Kategori komponen (dicatat saat assembling)"
            options={compOptions.data?.data ?? []}
            selected={components}
            onToggle={(cid) => setComponents((s) => toggleIn(s, cid))}
          />
          <CheckboxGroup
            label="Jenis aktivasi yang berlaku"
            options={actOptions.data?.data ?? []}
            selected={activations}
            onToggle={(aid) => setActivations((s) => toggleIn(s, aid))}
          />

          {canEdit && (
            <div>
              <Button
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({ name, code, stages, componentCategoryIds: [...components], activationTypeIds: [...activations] })
                }
              >
                Simpan Pengaturan Umum
              </Button>
            </div>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: MasterDto[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  // Opsi nonaktif hanya ditampilkan kalau sudah terpilih sebelumnya.
  const visible = options.filter((o) => o.isActive || selected.has(o.id));
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {visible.length === 0 && <span className="text-sm text-muted-foreground">Belum ada data master.</span>}
        {visible.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${selected.has(o.id) ? 'border-primary bg-muted' : ''}`}
          >
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} />
            {String((o as MasterDto & { name: string }).name)}
            {!o.isActive && <span className="text-xs text-muted-foreground">(nonaktif)</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Tombol naik/turun/hapus untuk baris yang bisa diurutkan. */
function RowControls({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0">
      <Button type="button" variant="ghost" size="icon-sm" tooltip="Pindah ke atas" disabled={index === 0} onClick={() => onMove(index - 1)}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" tooltip="Pindah ke bawah" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
        <ArrowDown />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" tooltip="Hapus baris ini" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

interface FieldRow {
  key: string;
  label: string;
  inputType: CustomFieldType;
  options: string;
  isRequired: boolean;
  isSecret: boolean;
}

function CustomFieldsSection({ data, canEdit }: { data: ProductTypeDetailDto; canEdit: boolean }) {
  const [rows, setRows] = useState<FieldRow[]>(
    data.customFields.map((f) => ({ ...f, options: (f.options ?? []).join(', ') })),
  );
  const save = useSave(data.id, '/custom-fields', 'Kolom tambahan disimpan');
  const update = (i: number, patch: Partial<FieldRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kolom Tambahan</CardTitle>
        <CardDescription>
          Data khusus yang diisi per unit untuk jenis produk ini (misalnya hostname server atau ukuran layar). Kolom rahasia disimpan terenkripsi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="grid gap-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Belum ada kolom tambahan.</p>}
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-40 flex-1 gap-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={r.label}
                    placeholder="contoh: Hostname"
                    onChange={(e) => {
                      const label = e.target.value;
                      // Isi kunci otomatis dari label selama kuncinya belum diubah manual.
                      const auto = r.key === '' || r.key === toKey(r.label);
                      update(i, { label, ...(auto ? { key: toKey(label) } : {}) });
                    }}
                  />
                </div>
                <div className="grid w-40 gap-1">
                  <Label className="text-xs">Kunci</Label>
                  <Input className="font-mono" value={r.key} onChange={(e) => update(i, { key: e.target.value })} />
                </div>
                <div className="grid w-48 gap-1">
                  <Label className="text-xs">Tipe</Label>
                  <NativeSelect value={r.inputType} onChange={(e) => update(i, { inputType: e.target.value as CustomFieldType })}>
                    {Object.entries(CUSTOM_FIELD_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {canEdit && <RowControls index={i} count={rows.length} onMove={(to) => setRows((x) => move(x, i, to))} onRemove={() => setRows((x) => x.filter((_, j) => j !== i))} />}
              </div>
              {r.inputType === 'select' && (
                <div className="grid gap-1">
                  <Label className="text-xs">Pilihan (pisahkan dengan koma)</Label>
                  <Input value={r.options} placeholder='contoh: 55", 65", 75"' onChange={(e) => update(i, { options: e.target.value })} />
                </div>
              )}
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={r.isRequired} onChange={(e) => update(i, { isRequired: e.target.checked })} /> Wajib diisi
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={r.isSecret} onChange={(e) => update(i, { isSecret: e.target.checked })} /> Rahasia
                </label>
              </div>
            </div>
          ))}
          {canEdit && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRows((r) => [...r, { key: '', label: '', inputType: 'text', options: '', isRequired: false, isSecret: false }])}
              >
                <Plus /> Tambah Kolom
              </Button>
              <Button
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    fields: rows.map((r) => ({
                      ...r,
                      options: r.inputType === 'select' ? r.options.split(',').map((o) => o.trim()).filter(Boolean) : null,
                    })),
                  })
                }
              >
                Simpan Kolom Tambahan
              </Button>
            </div>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}

/** "IP IPMI / iDRAC" → "ip_ipmi_idrac" */
function toKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 50);
}

interface QcRow {
  label: string;
  inputType: QcItemType;
  isRequired: boolean;
}

function QcTemplateSection({ data, canEdit }: { data: ProductTypeDetailDto; canEdit: boolean }) {
  const [rows, setRows] = useState<QcRow[]>(data.qcTemplate?.items.map(({ label, inputType, isRequired }) => ({ label, inputType, isRequired })) ?? []);
  const save = useSave(data.id, '/qc-template', 'Template QC disimpan sebagai versi baru');
  const update = (i: number, patch: Partial<QcRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Checklist QC {data.qcTemplate && <span className="text-sm font-normal text-muted-foreground">(versi {data.qcTemplate.version})</span>}
        </CardTitle>
        <CardDescription>
          Poin yang diperiksa divisi QC untuk setiap unit. Setiap kali disimpan dibuat versi baru; hasil QC lama tetap memakai versi saat diperiksa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="grid gap-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Belum ada checklist QC.</p>}
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <span className="w-6 text-right text-sm text-muted-foreground">{i + 1}.</span>
              <Input className="min-w-48 flex-1" value={r.label} placeholder="Poin pemeriksaan" onChange={(e) => update(i, { label: e.target.value })} />
              <NativeSelect className="w-36" value={r.inputType} onChange={(e) => update(i, { inputType: e.target.value as QcItemType })}>
                {Object.entries(QC_ITEM_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={r.isRequired} onChange={(e) => update(i, { isRequired: e.target.checked })} /> Wajib
              </label>
              {canEdit && <RowControls index={i} count={rows.length} onMove={(to) => setRows((x) => move(x, i, to))} onRemove={() => setRows((x) => x.filter((_, j) => j !== i))} />}
            </div>
          ))}
          {canEdit && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setRows((r) => [...r, { label: '', inputType: 'pass_fail', isRequired: true }])}>
                <Plus /> Tambah Poin
              </Button>
              <Button disabled={save.isPending} onClick={() => save.mutate({ items: rows })}>
                Simpan Checklist QC
              </Button>
            </div>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}
