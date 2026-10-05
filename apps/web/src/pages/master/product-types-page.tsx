import { canConfigureProductTypes, STAGE_LABELS, type ProductTypeDetailDto, type StageRequirement } from '@manpro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui-extra';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';
import { EmptyRow } from './master-page';
import { useProductTypes } from './products-page';

export const REQUIREMENT_STYLE: Record<StageRequirement, { label: string; className: string }> = {
  required: { label: 'Wajib', className: 'bg-primary text-primary-foreground' },
  optional: { label: 'Opsional', className: 'border border-border' },
  skipped: { label: 'Dilewati', className: 'text-muted-foreground line-through' },
};

export function ProductTypesPage() {
  const me = useMe().data!;
  const canEdit = canConfigureProductTypes(me);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const types = useProductTypes(includeInactive);

  return (
    <div className="grid gap-4">
      <PageHeader title="Jenis Produk" description="Setiap jenis produk mengatur tahapan kerja, komponen, jenis aktivasi, kolom tambahan, dan checklist QC.">
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> Tambah Jenis Produk
          </Button>
        )}
      </PageHeader>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
        Tampilkan yang nonaktif
      </label>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jenis Produk</TableHead>
              <TableHead>Tahapan</TableHead>
              <TableHead className="text-right">Produk</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.isLoading && <EmptyRow cols={4} text="Memuat…" />}
            {types.data?.map((t) => (
              <TableRow key={t.id} className={t.isActive ? '' : 'text-muted-foreground'}>
                <TableCell>
                  <Link to={`/master/product-types/${t.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {t.name}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{t.code}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {t.stages.map((s) => (
                      <span
                        key={s.stage}
                        title={REQUIREMENT_STYLE[s.requirement].label}
                        className={`rounded px-1.5 py-0.5 text-xs ${REQUIREMENT_STYLE[s.requirement].className}`}
                      >
                        {STAGE_LABELS[s.stage]}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">{t.productCount}</TableCell>
                <TableCell>{t.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        Keterangan:
        {Object.values(REQUIREMENT_STYLE).map((r) => (
          <span key={r.label} className={`rounded px-1.5 py-0.5 ${r.className}`}>
            {r.label}
          </span>
        ))}
      </p>

      {creating && <CreateProductTypeDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProductTypeDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api<ProductTypeDetailDto>('/api/product-types', { method: 'POST', body: { code, name } }),
    onSuccess: (pt) => {
      toast.success('Jenis produk dibuat. Silakan atur tahapan dan checklist QC-nya.');
      queryClient.invalidateQueries({ queryKey: ['product-types'] });
      navigate(`/master/product-types/${pt.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Tambah Jenis Produk</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="pt-name">Nama</Label>
            <Input id="pt-name" required autoFocus placeholder="contoh: Proyektor" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pt-code">Kode</Label>
            <Input
              id="pt-code"
              required
              placeholder="contoh: PROYEKTOR"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            />
            <p className="text-xs text-muted-foreground">Huruf besar, angka, atau garis bawah.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Buat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
