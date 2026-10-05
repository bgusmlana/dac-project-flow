import {
  canManageProjects,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  QC_MODE_LABELS,
  STAGE_LABELS,
  UNIT_STATUS_LABELS,
  UNIT_STATUSES,
  type ImportJobDto,
  type Paginated,
  type ProjectDetailDto,
  type ProjectItemDto,
  type ProjectStatus,
  type UnitDto,
} from '@manpro/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileSpreadsheet, Pencil, Plus, Printer, ScanLine, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Pager } from '@/components/list-toolbar';
import { NativeSelect } from '@/components/native-select';
import { ProgressBar, UnitStatusBadge } from '@/components/unit-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { EmptyRow } from '@/pages/master/master-page';
import { ItemFormDialog } from './item-form';
import { ProjectFormDialog } from './project-form';
import { Deadline, PROJECT_STATUS_VARIANT } from './projects-page';
import { AddUnitsDialog, ImportJobStatus, ImportUnitsDialog } from './unit-dialogs';

export function ProjectDetailPage() {
  const { id } = useParams();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => api<ProjectDetailDto>(`/api/projects/${id}`) });
  if (project.isLoading) return <p className="text-muted-foreground">Memuat…</p>;
  if (!project.data) return <p className="text-destructive">{errorMessage(project.error)}</p>;
  return <ProjectDetail p={project.data} />;
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{children || '—'}</div>
    </div>
  );
}

function ProjectDetail({ p }: { p: ProjectDetailDto }) {
  const me = useMe().data!;
  const canEdit = canManageProjects(me);
  const open = p.status !== 'completed' && p.status !== 'cancelled';
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [itemDialog, setItemDialog] = useState<ProjectItemDto | 'new' | null>(null);
  const [unitDialog, setUnitDialog] = useState<'add' | 'import' | null>(null);

  const setStatus = useMutation({
    mutationFn: (status: ProjectStatus) => api<ProjectDetailDto>(`/api/projects/${p.id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: (d) => {
      toast.success('Status project diubah');
      queryClient.setQueryData(['project', String(p.id)], d);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: number) => api<ProjectDetailDto>(`/api/projects/${p.id}/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: (d) => {
      toast.success('Item dihapus');
      queryClient.setQueryData(['project', String(p.id)], d);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const addableItems = p.items.filter((i) => i.unitCount < i.quantity);

  return (
    <div className="grid gap-4">
      <div>
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Project
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <span className="font-mono text-sm text-muted-foreground">{p.code}</span>
          <Badge variant={PROJECT_STATUS_VARIANT[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
          {canEdit && (
            <div className="ml-auto flex gap-2">
              <NativeSelect
                aria-label="Ubah status project"
                className="w-40"
                value={p.status}
                onChange={(e) => setStatus.mutate(e.target.value as ProjectStatus)}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil /> Ubah
              </Button>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Info label="Client">{p.clientName}</Info>
            <Info label="No. PO / Kontrak">{p.poNumber}</Info>
            <Info label="Deadline">
              <Deadline date={p.targetDate} done={!open} />
            </Info>
            <Info label="PIC">{p.picName}</Info>
            <Info label="Mode QC">
              {QC_MODE_LABELS[p.qcMode]}
              {p.qcMode === 'sampling' && ` — lot ${p.lotSize}, sampel ${p.samplePercent}%, batas gagal ${p.maxSampleFail}`}
            </Info>
            <Info label="Alamat pengiriman">{p.shippingAddress}</Info>
            <Info label="Dibuat">{formatDateTime(p.createdAt)}</Info>
            <Info label="Catatan">{p.notes}</Info>
          </div>
          <ProgressBar counts={p.counts} total={p.totalQuantity} showLegend />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item Produk</CardTitle>
          <CardDescription>Produk yang dipesan beserta jumlah dan alur tahapnya.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Unit / Jumlah</TableHead>
                  <TableHead>Tahapan</TableHead>
                  <TableHead>Kelengkapan</TableHead>
                  {canEdit && open && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.items.length === 0 && <EmptyRow cols={6} text="Belum ada item. Tambahkan produk yang dipesan." />}
                {p.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="font-medium">
                        {i.brand} {i.model}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {i.productTypeName}
                        {i.partNumber ? ` · ${i.partNumber}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>{i.vendorName}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatNumber(i.unitCount)} / {formatNumber(i.quantity)}
                    </TableCell>
                    <TableCell className="text-xs">{i.stages.map((s) => STAGE_LABELS[s]).join(' → ')}</TableCell>
                    <TableCell className="text-xs">{i.accessories.join(', ') || '—'}</TableCell>
                    {canEdit && open && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon-sm" tooltip="Ubah item" onClick={() => setItemDialog(i)}>
                          <Pencil />
                        </Button>
                        {i.unitCount === 0 && (
                          <Button variant="ghost" size="icon-sm" tooltip="Hapus item" onClick={() => deleteItem.mutate(i.id)}>
                            <Trash2 />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {canEdit && open && (
            <Button variant="outline" className="justify-self-start" onClick={() => setItemDialog('new')}>
              <Plus /> Tambah Item
            </Button>
          )}
        </CardContent>
      </Card>

      <UnitsCard
        project={p}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && open && addableItems.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => setUnitDialog('add')}>
                  <ScanLine /> Tambah / Scan Unit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setUnitDialog('import')}>
                  <FileSpreadsheet /> Import Excel
                </Button>
              </>
            )}
            {p.unitCount > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => window.open(`/print/unit-labels/${p.id}`, '_blank')}>
                  <Printer /> Cetak Label SN
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open(`/api/projects/${p.id}/export`, '_blank')}>
                  <Download /> Export Excel
                </Button>
              </>
            )}
          </div>
        }
      />

      <ImportHistory projectId={p.id} />

      {editing && <ProjectFormDialog project={p} onClose={() => setEditing(false)} />}
      {itemDialog && <ItemFormDialog projectId={p.id} item={itemDialog === 'new' ? null : itemDialog} onClose={() => setItemDialog(null)} />}
      {unitDialog === 'add' && <AddUnitsDialog projectId={p.id} items={addableItems} onClose={() => setUnitDialog(null)} />}
      {unitDialog === 'import' && <ImportUnitsDialog projectId={p.id} items={addableItems} onClose={() => setUnitDialog(null)} />}
    </div>
  );
}


function UnitsCard({ project, actions }: { project: ProjectDetailDto; actions: React.ReactNode }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [itemId, setItemId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) params.set('search', search.trim());
  if (status) params.set('status', status);
  if (itemId) params.set('projectItemId', itemId);

  const list = useQuery({
    queryKey: ['units', project.id, params.toString()],
    queryFn: () => api<Paginated<UnitDto>>(`/api/projects/${project.id}/units?${params}`),
    placeholderData: keepPreviousData,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Unit</CardTitle>
          <CardDescription>Setiap barang fisik dengan serial number-nya.</CardDescription>
        </div>
        {actions}
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="Cari serial number…" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          <NativeSelect className="w-40" value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
            <option value="">Semua status</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {UNIT_STATUS_LABELS[s]}
                {project.counts[s] ? ` (${formatNumber(project.counts[s] ?? 0)})` : ''}
              </option>
            ))}
          </NativeSelect>
          {project.items.length > 1 && (
            <NativeSelect className="w-56" value={itemId} onChange={(e) => reset(setItemId)(e.target.value)}>
              <option value="">Semua item</option>
              {project.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.brand} {i.model}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serial Number</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Didaftarkan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && <EmptyRow cols={4} text="Memuat…" />}
              {list.data?.data.length === 0 && <EmptyRow cols={4} text="Belum ada unit." />}
              {list.data?.data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link to={`/units/${u.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                      {u.serialNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{u.itemLabel}</TableCell>
                  <TableCell>
                    <UnitStatusBadge status={u.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(u.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {list.data && <Pager page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} unit="unit" />}
      </CardContent>
    </Card>
  );
}

function ImportHistory({ projectId }: { projectId: string }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const jobs = useQuery({
    queryKey: ['imports', projectId],
    queryFn: () => api<ImportJobDto[]>(`/api/projects/${projectId}/imports`),
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === 'queued' || j.status === 'processing') ? 2000 : false),
  });
  if (!jobs.data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Riwayat Import</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {jobs.data.map((j) =>
          openId === j.id ? (
            <div key={j.id} className="grid gap-1">
              <ImportJobStatus jobId={j.id} />
              <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setOpenId(null)}>
                Tutup detail
              </Button>
            </div>
          ) : (
            <button key={j.id} className="flex flex-wrap justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setOpenId(j.id)}>
              <span>
                {j.fileName} <span className="text-muted-foreground">· {formatDateTime(j.createdAt)}</span>
              </span>
              <span>
                {j.status === 'done' ? `${formatNumber(j.successRows)} berhasil, ${formatNumber(j.failedRows)} gagal` : j.status === 'failed' ? 'Gagal' : 'Diproses…'}
              </span>
            </button>
          ),
        )}
      </CardContent>
    </Card>
  );
}
