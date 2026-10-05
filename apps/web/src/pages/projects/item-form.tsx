import { STAGE_LABELS, type Paginated, type ProductDto, type ProductTypeDetailDto, type ProjectDetailDto, type ProjectItemDto, type Stage } from '@manpro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMasterOptions } from '@/hooks/use-options';
import { api, errorMessage } from '@/lib/api';

export function ItemFormDialog({ projectId, item, onClose }: { projectId: string; item: ProjectItemDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const vendors = useMasterOptions('vendors');
  const locked = !!item && item.unitCount > 0;
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState(item?.productId ?? 0);
  const [productLabel, setProductLabel] = useState(item ? `${item.brand} ${item.model}${item.partNumber ? ` (${item.partNumber})` : ''}` : '');
  const [productTypeId, setProductTypeId] = useState(item?.productTypeId ?? 0);
  const [vendorId, setVendorId] = useState(String(item?.vendorId ?? ''));
  const [quantity, setQuantity] = useState(String(item?.quantity ?? ''));
  const [optional, setOptional] = useState<Stage[]>([]);
  const [optionalInit, setOptionalInit] = useState(false);
  const [accessories, setAccessories] = useState((item?.accessories ?? []).join(', '));

  const products = useQuery({
    queryKey: ['products', 'picker', search],
    queryFn: () => api<Paginated<ProductDto>>(`/api/products?pageSize=20&search=${encodeURIComponent(search)}`),
    enabled: !locked,
  });
  const type = useQuery({
    queryKey: ['product-type', String(productTypeId)],
    queryFn: () => api<ProductTypeDetailDto>(`/api/product-types/${productTypeId}`),
    enabled: productTypeId > 0,
  });

  // Saat mengubah item, tandai tahap opsional yang sudah dipakai item ini.
  const optionalStages = type.data?.stages.filter((s) => s.requirement === 'optional').map((s) => s.stage) ?? [];
  if (item && type.data && !optionalInit) {
    setOptional(item.stages.filter((s) => optionalStages.includes(s)));
    setOptionalInit(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        productId,
        vendorId: Number(vendorId),
        quantity: Number(quantity),
        optionalStages: optional,
        accessories: accessories.split(',').map((a) => a.trim()).filter(Boolean),
      };
      return item
        ? api<ProjectDetailDto>(`/api/projects/${projectId}/items/${item.id}`, { method: 'PUT', body })
        : api<ProjectDetailDto>(`/api/projects/${projectId}/items`, { method: 'POST', body });
    },
    onSuccess: (p) => {
      toast.success(item ? 'Item diperbarui' : 'Item ditambahkan');
      queryClient.setQueryData(['project', String(projectId)], p);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!productId) return toast.error('Pilih produk dulu');
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{item ? 'Ubah Item' : 'Tambah Item Produk'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-2">
            <Label>
              Produk<span className="text-destructive">*</span>
            </Label>
            {productId > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span>
                  {productLabel}
                  {type.data && <span className="text-muted-foreground"> · {type.data.name}</span>}
                </span>
                {!locked && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setProductId(0)}>
                    Ganti
                  </Button>
                )}
              </div>
            )}
            {locked && <p className="text-xs text-muted-foreground">Produk dan tahapan tidak bisa diganti karena item ini sudah punya unit.</p>}
            {productId === 0 && (
              <>
                <Input autoFocus placeholder="Cari merek, tipe, atau part number…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="max-h-48 overflow-y-auto rounded-lg border">
                  {products.data?.data.length === 0 && <p className="p-3 text-sm text-muted-foreground">Produk tidak ditemukan. Tambahkan di Master Data → Katalog Produk.</p>}
                  {products.data?.data.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                      onClick={() => {
                        setProductId(p.id);
                        setProductLabel(`${p.brand} ${p.model}${p.partNumber ? ` (${p.partNumber})` : ''}`);
                        setProductTypeId(p.productTypeId);
                        setOptional([]);
                      }}
                    >
                      <span className="font-medium">
                        {p.brand} {p.model}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {p.productTypeName}
                        {p.partNumber ? ` · ${p.partNumber}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="it-vendor">
                Supplier / Vendor / Prinsipal<span className="text-destructive">*</span>
              </Label>
              <NativeSelect id="it-vendor" required value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Pilih vendor…</option>
                {item && !vendors.data?.some((v) => v.id === item.vendorId) && <option value={item.vendorId}>{item.vendorName}</option>}
                {vendors.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="it-qty">
                Jumlah unit<span className="text-destructive">*</span>
              </Label>
              <Input id="it-qty" type="number" min={Math.max(1, item?.unitCount ?? 1)} required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>

          {type.data && (
            <div className="grid gap-2">
              <Label>Tahapan unit</Label>
              <div className="flex flex-wrap gap-2 text-sm">
                {type.data.stages
                  .filter((s) => s.requirement !== 'skipped')
                  .map((s) =>
                    s.requirement === 'required' ? (
                      <span key={s.stage} className="rounded-lg border bg-muted px-2.5 py-1">
                        ✓ {STAGE_LABELS[s.stage]} <span className="text-xs text-muted-foreground">(wajib)</span>
                      </span>
                    ) : (
                      <label key={s.stage} className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1">
                        <input
                          type="checkbox"
                          disabled={locked}
                          checked={optional.includes(s.stage)}
                          onChange={(e) => setOptional((o) => (e.target.checked ? [...o, s.stage] : o.filter((x) => x !== s.stage)))}
                        />
                        {STAGE_LABELS[s.stage]} <span className="text-xs text-muted-foreground">(opsional)</span>
                      </label>
                    ),
                  )}
              </div>
              <p className="text-xs text-muted-foreground">Centang tahap opsional yang dikerjakan untuk item ini (misalnya upgrade RAM = Assembling).</p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="it-acc">Kelengkapan per unit</Label>
            <Input id="it-acc" placeholder="contoh: Monitor, Keyboard & Mouse" value={accessories} onChange={(e) => setAccessories(e.target.value)} />
            <p className="text-xs text-muted-foreground">Pisahkan dengan koma. Saat packing, sistem mengecek setiap unit sudah punya kelengkapan ini.</p>
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
