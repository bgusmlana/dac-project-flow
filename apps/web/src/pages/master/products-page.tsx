import { canManageMasterData, type Paginated, type ProductDto, type ProductTypeSummaryDto } from '@manpro/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ListToolbar, Pager } from '@/components/list-toolbar';
import { NativeSelect } from '@/components/native-select';
import { ToggleActiveDialog } from '@/components/status-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, Textarea } from '@/components/ui-extra';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';
import { EmptyRow } from './master-page';


export function useProductTypes(includeInactive = false) {
  return useQuery({
    queryKey: ['product-types', includeInactive],
    queryFn: () => api<ProductTypeSummaryDto[]>(`/api/product-types?includeInactive=${includeInactive}`),
  });
}

export function ProductsPage() {
  const me = useMe().data!;
  const canEdit = canManageMasterData(me);
  const queryClient = useQueryClient();
  const types = useProductTypes();
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [editing, setEditing] = useState<ProductDto | 'new' | null>(null);
  const [toggling, setToggling] = useState<ProductDto | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), includeInactive: String(includeInactive) });
  if (search.trim()) params.set('search', search.trim());
  if (typeId) params.set('productTypeId', typeId);

  const list = useQuery({
    queryKey: ['products', params.toString()],
    queryFn: () => api<Paginated<ProductDto>>(`/api/products?${params}`),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (p: ProductDto) => api(`/api/products/${p.id}/active`, { method: 'PATCH', body: { isActive: !p.isActive } }),
    onSuccess: () => {
      toast.success('Status berhasil diubah');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setToggling(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-4">
      <PageHeader title="Katalog Produk" description="Daftar produk (merek, tipe, part number) yang bisa dipilih saat membuat project.">
        {canEdit && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> Tambah Produk
          </Button>
        )}
      </PageHeader>

      <ListToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        includeInactive={includeInactive}
        onIncludeInactive={(v) => {
          setIncludeInactive(v);
          setPage(1);
        }}
      >
        <NativeSelect
          className="w-52"
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua jenis produk</option>
          {types.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
      </ListToolbar>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merek</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Part Number</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Spesifikasi</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && <EmptyRow cols={7} text="Memuat…" />}
            {list.data?.data.length === 0 && <EmptyRow cols={7} text="Belum ada produk." />}
            {list.data?.data.map((p) => (
              <TableRow key={p.id} className={p.isActive ? '' : 'text-muted-foreground'}>
                <TableCell className="font-medium">{p.brand}</TableCell>
                <TableCell>{p.model}</TableCell>
                <TableCell className="font-mono text-xs">{p.partNumber ?? '—'}</TableCell>
                <TableCell>{p.productTypeName}</TableCell>
                <TableCell className="max-w-72 truncate" title={p.specification ?? ''}>
                  {p.specification ?? '—'}
                </TableCell>
                <TableCell>{p.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
                {canEdit && (
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon-sm" tooltip="Ubah produk" onClick={() => setEditing(p)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" tooltip={p.isActive ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => setToggling(p)}>
                      <Power />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {list.data && <Pager page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} unit="produk" />}

      {editing && <ProductFormDialog product={editing === 'new' ? null : editing} types={types.data ?? []} onClose={() => setEditing(null)} />}
      {toggling && (
        <ToggleActiveDialog
          name={`${toggling.brand} ${toggling.model}`}
          isActive={toggling.isActive}
          pending={toggle.isPending}
          onConfirm={() => toggle.mutate(toggling)}
          onClose={() => setToggling(null)}
        />
      )}
    </div>
  );
}

function ProductFormDialog({ product, types, onClose }: { product: ProductDto | null; types: ProductTypeSummaryDto[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    productTypeId: String(product?.productTypeId ?? ''),
    brand: product?.brand ?? '',
    model: product?.model ?? '',
    partNumber: product?.partNumber ?? '',
    specification: product?.specification ?? '',
  });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, productTypeId: Number(form.productTypeId) };
      return product ? api(`/api/products/${product.id}`, { method: 'PUT', body }) : api('/api/products', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success(product ? 'Produk berhasil diubah' : 'Produk berhasil ditambahkan');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{product ? 'Ubah Produk' : 'Tambah Produk'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="p-type">
              Jenis produk<span className="text-destructive">*</span>
            </Label>
            <NativeSelect id="p-type" required value={form.productTypeId} onChange={(e) => set('productTypeId', e.target.value)}>
              <option value="">Pilih jenis produk…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="p-brand">
                Merek<span className="text-destructive">*</span>
              </Label>
              <Input id="p-brand" required value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-model">
                Tipe<span className="text-destructive">*</span>
              </Label>
              <Input id="p-model" required value={form.model} onChange={(e) => set('model', e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-pn">Part Number</Label>
            <Input id="p-pn" value={form.partNumber} onChange={(e) => set('partNumber', e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-spec">Spesifikasi / SKU</Label>
            <Textarea id="p-spec" value={form.specification} onChange={(e) => set('specification', e.target.value)} />
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
