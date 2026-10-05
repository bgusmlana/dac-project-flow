import type { UnitDetailDto } from '@manpro/shared';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';
import { useInvalidateWork } from '@/hooks/use-invalidate-work';
import type { UnitPanelProps } from './stage-panels';

export function AssemblingPanel({ unit, onChange, onDone }: UnitPanelProps) {
  const invalidate = useInvalidateWork();
  // Kategori pertama wajib dipilih sendiri supaya tidak salah kategori; berikutnya otomatis maju.
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [sn, setSn] = useState('');
  const brandRef = useRef<HTMLInputElement>(null);

  const add = useMutation({
    mutationFn: () =>
      api<UnitDetailDto>(`/api/units/${unit.id}/components`, {
        method: 'POST',
        body: { componentCategoryId: Number(categoryId), brand, model, serialNumber: sn },
      }),
    onSuccess: (u) => {
      onChange(u);
      setSn('');
      // Merek & tipe sering sama untuk unit berikutnya, jadi tidak dikosongkan. Pindah ke kategori berikutnya.
      const used = new Set(u.components.map((c) => c.componentCategoryId));
      const next = u.componentCategories.find((c) => !used.has(c.id));
      if (next) setCategoryId(String(next.id));
      brandRef.current?.focus();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (componentId: number) => api<UnitDetailDto>(`/api/units/${unit.id}/components/${componentId}`, { method: 'DELETE' }),
    onSuccess: onChange,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const complete = useMutation({
    mutationFn: () => api<{ moved: number }>('/api/work/assembling/complete', { method: 'POST', body: { unitIds: [unit.id] } }),
    onSuccess: () => {
      toast.success(`${unit.serialNumber} selesai assembling`);
      invalidate();
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Komponen terpasang ({unit.components.length})</Label>
        {unit.components.length === 0 && <p className="text-sm text-muted-foreground">Belum ada komponen.</p>}
        {unit.components.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>
              <b>{c.categoryName}</b> · {c.brand} {c.model}
              {c.serialNumber && <span className="font-mono text-muted-foreground"> · {c.serialNumber}</span>}
            </span>
            <Button variant="ghost" size="icon-sm" tooltip="Hapus komponen" onClick={() => remove.mutate(c.id)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <form
        className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[10rem_1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="grid gap-1">
          <Label className="text-xs">Kategori</Label>
          <NativeSelect required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Pilih…</option>
            {unit.componentCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Merek</Label>
          <Input ref={brandRef} required value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Tipe</Label>
          <Input required value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Serial number (scan)</Label>
          <Input className="font-mono" value={sn} onChange={(e) => setSn(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" disabled={add.isPending || !categoryId}>
          <Plus /> Tambah
        </Button>
      </form>
      {unit.componentCategories.length === 0 && (
        <p className="text-sm text-orange-600">Jenis produk ini belum punya kategori komponen. Atur di Master Data → Jenis Produk.</p>
      )}

      <Button className="justify-self-start" disabled={unit.components.length === 0 || complete.isPending} onClick={() => complete.mutate()}>
        <CheckCircle2 /> Selesai Assembling
      </Button>
    </div>
  );
}
