import { canManageMasterData, type MasterDto, type MasterKind, type Paginated } from '@manpro/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
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
import { MASTER_CONFIG, type MasterConfig } from './config';

type Row = MasterDto & Record<string, unknown>;

export function MasterPage() {
  const { kind } = useParams() as { kind: MasterKind };
  const config = MASTER_CONFIG[kind];
  // key={kind} supaya state (pencarian, halaman) direset saat pindah menu.
  return config ? <MasterList key={kind} kind={kind} config={config} /> : <p>Halaman tidak ditemukan.</p>;
}

function MasterList({ kind, config }: { kind: MasterKind; config: MasterConfig }) {
  const me = useMe().data!;
  const canEdit = canManageMasterData(me);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [toggling, setToggling] = useState<Row | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), includeInactive: String(includeInactive) });
  if (search.trim()) params.set('search', search.trim());

  const list = useQuery({
    queryKey: ['master', kind, params.toString()],
    queryFn: () => api<Paginated<Row>>(`/api/master/${kind}?${params}`),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (row: Row) => api(`/api/master/${kind}/${row.id}/active`, { method: 'PATCH', body: { isActive: !row.isActive } }),
    onSuccess: () => {
      toast.success('Status berhasil diubah');
      queryClient.invalidateQueries({ queryKey: ['master', kind] });
      setToggling(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const tableFields = config.fields.filter((f) => f.inTable);

  return (
    <div className="grid gap-4">
      <PageHeader title={config.title} description={config.description}>
        {canEdit && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> Tambah {config.noun}
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
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {tableFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && <EmptyRow cols={tableFields.length + 2} text="Memuat…" />}
            {list.data?.data.length === 0 && <EmptyRow cols={tableFields.length + 2} text="Belum ada data." />}
            {list.data?.data.map((row) => (
              <TableRow key={row.id} className={row.isActive ? '' : 'text-muted-foreground'}>
                {tableFields.map((f) => (
                  <TableCell key={f.key} className={f.key === 'name' ? 'font-medium' : ''}>
                    {displayValue(row[f.key], f.options)}
                  </TableCell>
                ))}
                <TableCell>{row.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
                {canEdit && (
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon-sm" tooltip="Ubah data" onClick={() => setEditing(row)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      tooltip={row.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      onClick={() => setToggling(row)}
                    >
                      <Power />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {list.data && <Pager page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} unit="data" />}

      {editing && <MasterFormDialog kind={kind} config={config} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {toggling && (
        <ToggleActiveDialog
          name={String(toggling.name)}
          isActive={toggling.isActive}
          pending={toggle.isPending}
          onConfirm={() => toggle.mutate(toggling)}
          onClose={() => setToggling(null)}
        />
      )}
    </div>
  );
}

export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function displayValue(value: unknown, options?: Record<string, string>) {
  if (value === null || value === undefined || value === '') return '—';
  return options?.[String(value)] ?? String(value);
}

function MasterFormDialog({ kind, config, row, onClose }: { kind: MasterKind; config: MasterConfig; row: Row | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      config.fields.map((f) => [f.key, row ? String(row[f.key] ?? '') : f.type === 'select' ? Object.keys(f.options ?? {})[0] ?? '' : '']),
    ),
  );

  const save = useMutation({
    mutationFn: () =>
      row
        ? api(`/api/master/${kind}/${row.id}`, { method: 'PUT', body: values })
        : api(`/api/master/${kind}`, { method: 'POST', body: values }),
    onSuccess: () => {
      toast.success(row ? 'Data berhasil diubah' : 'Data berhasil ditambahkan');
      queryClient.invalidateQueries({ queryKey: ['master', kind] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {row ? 'Ubah' : 'Tambah'} {config.noun}
            </DialogTitle>
          </DialogHeader>
          {config.fields.map((f) => (
            <div key={f.key} className="grid gap-2">
              <Label htmlFor={`f-${f.key}`}>
                {f.label}
                {f.required && <span className="text-destructive">*</span>}
              </Label>
              {f.type === 'select' ? (
                <NativeSelect id={`f-${f.key}`} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                  {Object.entries(f.options ?? {}).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              ) : f.type === 'textarea' ? (
                <Textarea id={`f-${f.key}`} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <Input
                  id={`f-${f.key}`}
                  type={f.type}
                  required={f.required}
                  autoFocus={f.key === 'name'}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
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
