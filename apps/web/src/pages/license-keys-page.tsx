import {
  canManageLicenseKeys,
  LICENSE_KEY_STATUS_LABELS,
  LICENSE_KEY_STATUSES,
  type KeyStockDto,
  type LicenseKeyDto,
  type MasterDto,
  type Paginated,
  type ProjectSummaryDto,
} from '@manpro/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Eye, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Pager } from '@/components/list-toolbar';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, Textarea } from '@/components/ui-extra';
import { useMe } from '@/hooks/use-me';
import { useMasterOptions } from '@/hooks/use-options';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { EmptyRow } from '@/pages/master/master-page';

type Named = MasterDto & { name: string };

/** Pilihan "jenis aktivasi atau software" dengan nilai `t:<id>` / `s:<id>`. */
function TargetSelect({ value, onChange, allowAll }: { value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  const types = useMasterOptions<Named>('activation-types');
  const software = useMasterOptions<Named>('software');
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allowAll ? 'Semua jenis' : 'Pilih jenis…'}</option>
      <optgroup label="Jenis aktivasi">
        {types.data?.map((t) => (
          <option key={t.id} value={`t:${t.id}`}>
            {t.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Software">
        {software.data?.map((s) => (
          <option key={s.id} value={`s:${s.id}`}>
            {s.name}
          </option>
        ))}
      </optgroup>
    </NativeSelect>
  );
}

function targetBody(v: string) {
  const id = Number(v.slice(2));
  return v.startsWith('s:') ? { activationTypeId: null, softwareId: id } : { activationTypeId: id, softwareId: null };
}

function useProjectOptions() {
  return useQuery({
    queryKey: ['projects', 'options'],
    queryFn: async () => (await api<Paginated<ProjectSummaryDto>>('/api/projects?pageSize=100')).data,
  });
}

export function LicenseKeysPage() {
  const me = useMe().data!;
  const canManage = canManageLicenseKeys(me);
  const [dialog, setDialog] = useState<'import' | 'allocate' | null>(null);
  const stock = useQuery({ queryKey: ['license-keys', 'stock'], queryFn: () => api<KeyStockDto[]>('/api/license-keys/stock') });

  return (
    <div className="grid gap-4">
      <PageHeader title="License Key" description="Stok license key per jenis aktivasi / software. Key disimpan terenkripsi dan ditampilkan tersamar.">
        {canManage && (
          <>
            <Button variant="outline" onClick={() => setDialog('allocate')}>
              <ArrowRightLeft /> Alokasi ke Project
            </Button>
            <Button onClick={() => setDialog('import')}>
              <Upload /> Import Key
            </Button>
          </>
        )}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Stok</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Alokasi</TableHead>
                  {LICENSE_KEY_STATUSES.map((s) => (
                    <TableHead key={s} className="text-right">
                      {LICENSE_KEY_STATUS_LABELS[s]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.data?.length === 0 && <EmptyRow cols={7} text="Belum ada license key." />}
                {stock.data?.map((s) => (
                  <TableRow key={`${s.activationTypeId}-${s.softwareId}-${s.projectId}`}>
                    <TableCell className="font-medium">{s.targetName}</TableCell>
                    <TableCell>{s.projectCode ? <Link to={`/projects/${s.projectId}`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">{s.projectCode}</Link> : <span className="text-muted-foreground">Stok umum</span>}</TableCell>
                    {LICENSE_KEY_STATUSES.map((st) => (
                      <TableCell key={st} className={`text-right ${st === 'available' ? 'font-semibold' : ''}`}>
                        {s.counts[st] ? formatNumber(s.counts[st] ?? 0) : '—'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <KeyList canManage={canManage} />

      {dialog === 'import' && <ImportKeysDialog onClose={() => setDialog(null)} />}
      {dialog === 'allocate' && <AllocateDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function KeyList({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (target) params.set(target.startsWith('s:') ? 'softwareId' : 'activationTypeId', target.slice(2));
  if (status) params.set('status', status);
  if (search.trim()) params.set('search', search.trim());

  const list = useQuery({
    queryKey: ['license-keys', 'list', params.toString()],
    queryFn: () => api<Paginated<LicenseKeyDto>>(`/api/license-keys?${params}`),
    placeholderData: keepPreviousData,
  });

  const reveal = useMutation({
    mutationFn: (id: number) => api<{ key: string }>(`/api/license-keys/${id}/reveal`, { method: 'POST' }),
    onSuccess: (r, id) => setRevealed((x) => ({ ...x, [id]: r.key })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setKeyStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'revoked' | 'available' }) => api(`/api/license-keys/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      toast.success('Status key diubah');
      queryClient.invalidateQueries({ queryKey: ['license-keys'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daftar Key</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="w-64">
            <TargetSelect allowAll value={target} onChange={(v) => { setTarget(v); setPage(1); }} />
          </div>
          <NativeSelect className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Semua status</option>
            {LICENSE_KEY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LICENSE_KEY_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <Input className="max-w-xs" placeholder="5 karakter terakhir key / SN unit" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Berlaku s/d</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.data.length === 0 && <EmptyRow cols={7} text="Tidak ada key." />}
              {list.data?.data.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-mono text-xs">{revealed[k.id] ?? k.masked}</TableCell>
                  <TableCell>{k.targetName}</TableCell>
                  <TableCell>{LICENSE_KEY_STATUS_LABELS[k.status]}</TableCell>
                  <TableCell className="font-mono text-xs">{k.projectCode ?? '—'}</TableCell>
                  <TableCell>
                    {k.unitId ? (
                      <Link to={`/units/${k.unitId}`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">
                        {k.unitSerialNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(k.validUntil)}</TableCell>
                  {canManage && (
                    <TableCell className="text-right whitespace-nowrap">
                      {!revealed[k.id] && (
                        <Button variant="ghost" size="icon-sm" tooltip="Lihat key (tercatat)" onClick={() => reveal.mutate(k.id)}>
                          <Eye />
                        </Button>
                      )}
                      {(k.status === 'available' || k.status === 'failed') && !k.unitId && (
                        <Button variant="ghost" size="sm" onClick={() => setKeyStatus.mutate({ id: k.id, status: 'revoked' })}>
                          Cabut
                        </Button>
                      )}
                      {(k.status === 'revoked' || (k.status === 'failed' && !k.unitId)) && (
                        <Button variant="ghost" size="sm" onClick={() => setKeyStatus.mutate({ id: k.id, status: 'available' })}>
                          Kembalikan ke stok
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {list.data && <Pager page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} unit="key" />}
      </CardContent>
    </Card>
  );
}

function ImportKeysDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const projects = useProjectOptions();
  const [target, setTarget] = useState('');
  const [projectId, setProjectId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [text, setText] = useState('');
  const keys = text.split(/[\r\n,;\t]+/).map((k) => k.trim()).filter((k) => k.length >= 5);

  const run = useMutation({
    mutationFn: () =>
      api<{ inserted: number; duplicates: number }>('/api/license-keys/import', {
        method: 'POST',
        body: { ...targetBody(target), projectId: projectId || null, validUntil, keys },
      }),
    onSuccess: (r) => {
      toast.success(`${formatNumber(r.inserted)} key masuk${r.duplicates ? `, ${formatNumber(r.duplicates)} sudah ada (dilewati)` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['license-keys'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import License Key</DialogTitle>
          <DialogDescription>Tempel key (satu per baris), atau pilih file .txt/.csv berisi satu key per baris. Key yang sudah ada otomatis dilewati.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Jenis aktivasi / software</Label>
            <TargetSelect value={target} onChange={setTarget} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Alokasi ke project (opsional)</Label>
              <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Stok umum</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label>Berlaku sampai (opsional)</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
          <input
            type="file"
            accept=".txt,.csv"
            className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
          />
          <Textarea className="min-h-40 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX\n…'} />
          <p className="text-xs text-muted-foreground">{formatNumber(keys.length)} key terbaca.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={!target || keys.length === 0 || run.isPending} onClick={() => run.mutate()}>
            Import {formatNumber(keys.length)} Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllocateDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const projects = useProjectOptions();
  const [target, setTarget] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [count, setCount] = useState('');

  const run = useMutation({
    mutationFn: () =>
      api<{ moved: number }>('/api/license-keys/allocate', {
        method: 'POST',
        body: { ...targetBody(target), fromProjectId: from || null, toProjectId: to || null, count: Number(count) },
      }),
    onSuccess: (r) => {
      toast.success(`${formatNumber(r.moved)} key dipindahkan`);
      queryClient.invalidateQueries({ queryKey: ['license-keys'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const projectSelect = (value: string, onChange: (v: string) => void) => (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Stok umum</option>
      {projects.data?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.code} · {p.name}
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alokasi Key ke Project</DialogTitle>
          <DialogDescription>Memindahkan sejumlah key berstatus Tersedia. Unit di project tujuan akan memakai key alokasinya dulu sebelum stok umum.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Jenis</Label>
            <TargetSelect value={target} onChange={setTarget} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Dari</Label>
              {projectSelect(from, setFrom)}
            </div>
            <div className="grid gap-1">
              <Label>Ke</Label>
              {projectSelect(to, setTo)}
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Jumlah key</Label>
            <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={!target || !count || from === to || run.isPending} onClick={() => run.mutate()}>
            Pindahkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
