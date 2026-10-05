import { ACTIVITY_ACTION_LABELS, ENTITY_TYPE_LABELS, type ActivityLogDto, type HistoryUserDto, type Paginated } from '@manpro/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { Pager } from '@/components/list-toolbar';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Field, PageHeader } from '@/components/ui-extra';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmptyRow } from '@/pages/master/master-page';
import { DateRangePicker, daysAgo, type Range } from './date-range';

type Option = { value: string; label: string };

/** Tautan ke halaman data yang diubah (kalau ada halamannya). */
function entityLink(type: string, id: string): string | null {
  if (type === 'unit') return `/units/${id}`;
  if (type === 'project') return `/projects/${id}`;
  if (type === 'product_type') return `/master/product-types/${id}`;
  return null;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Tabel perubahan: nilai lama → nilai baru per kolom. */
function Changes({ oldValues, newValues }: { oldValues: unknown; newValues: unknown }) {
  const o = (oldValues && typeof oldValues === 'object' ? oldValues : {}) as Record<string, unknown>;
  const n = (newValues && typeof newValues === 'object' ? newValues : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])];
  if (keys.length === 0) return <p className="text-xs text-muted-foreground">Tidak ada rincian perubahan.</p>;
  const hasOld = Object.keys(o).length > 0;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 pr-3 font-medium">Kolom</th>
          {hasOld && <th className="py-1 pr-3 font-medium">Sebelum</th>}
          <th className="py-1 font-medium">{hasOld ? 'Sesudah' : 'Nilai'}</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const changed = hasOld && show(o[k]) !== show(n[k]);
          return (
            <tr key={k} className="border-t align-top">
              <td className="py-1 pr-3 font-mono">{k}</td>
              {hasOld && <td className={cn('py-1 pr-3 break-all', changed && 'text-destructive line-through')}>{show(o[k])}</td>}
              <td className={cn('py-1 break-all', changed && 'font-medium text-green-700 dark:text-green-400')}>{show(n[k])}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ActivityLogPage() {
  const [range, setRange] = useState<Range>({ from: daysAgo(6), to: daysAgo(0) });
  const [userId, setUserId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [open, setOpen] = useState<number | null>(null);

  const params = new URLSearchParams({ from: range.from, to: range.to, page: String(page), pageSize: String(pageSize) });
  if (userId) params.set('userId', userId);
  if (entityType) params.set('entityType', entityType);
  if (action) params.set('action', action);
  if (search.trim()) params.set('search', search.trim());

  const users = useQuery({ queryKey: ['work-history', 'users'], queryFn: () => api<HistoryUserDto[]>('/api/work-history/users') });
  const facets = useQuery({ queryKey: ['activity-logs', 'facets'], queryFn: () => api<{ entityTypes: Option[]; actions: Option[] }>('/api/activity-logs/facets') });
  const list = useQuery({
    queryKey: ['activity-logs', params.toString()],
    queryFn: () => api<Paginated<ActivityLogDto>>(`/api/activity-logs?${params}`),
    placeholderData: keepPreviousData,
  });

  const set =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };

  return (
    <div className="grid gap-4">
      <PageHeader title="Log Aktivitas" description="Semua perubahan data di aplikasi: siapa, kapan, apa yang diubah, dan dari mana. Klik baris untuk melihat rincian perubahan." />

      <Card>
        <CardContent className="grid gap-3">
          <Field label="Periode" group>
            <DateRangePicker value={range} onChange={set(setRange)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="User">
              <NativeSelect value={userId} onChange={(e) => set(setUserId)(e.target.value)}>
                <option value="">Semua user</option>
                {users.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.divisionName ? ` · ${u.divisionName}` : ''}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Jenis data">
              <NativeSelect value={entityType} onChange={(e) => set(setEntityType)(e.target.value)}>
                <option value="">Semua jenis data</option>
                {facets.data?.entityTypes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Aksi">
              <NativeSelect value={action} onChange={(e) => set(setAction)(e.target.value)}>
                <option value="">Semua aksi</option>
                {facets.data?.actions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Cari">
              <Input placeholder="ID data atau isi perubahan…" value={search} onChange={(e) => set(setSearch)(e.target.value)} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Waktu</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Alamat IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading && <EmptyRow cols={6} text="Memuat…" />}
                {list.data?.data.length === 0 && <EmptyRow cols={6} text="Tidak ada aktivitas pada rentang tanggal & filter ini." />}
                {list.data?.data.map((l) => {
                  const link = entityLink(l.entityType, l.entityId);
                  const isOpen = open === l.id;
                  return (
                    <Fragment key={l.id}>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}>
                        <TableCell>
                          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(l.createdAt)}</TableCell>
                        <TableCell>{l.userName ?? 'sistem'}</TableCell>
                        <TableCell>
                          <Badge variant={l.action.includes('delete') || l.action.startsWith('remove') ? 'destructive' : 'secondary'}>
                            {ACTIVITY_ACTION_LABELS[l.action] ?? l.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {ENTITY_TYPE_LABELS[l.entityType] ?? l.entityType}{' '}
                          {link ? (
                            <Link to={link} className="font-mono text-xs text-primary underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                              #{l.entityId}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">#{l.entityId}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{l.ipAddress ?? '—'}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={5} className="whitespace-normal">
                            <Changes oldValues={l.oldValues} newValues={l.newValues} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {list.data && <Pager page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} unit="aktivitas" />}
        </CardContent>
      </Card>
    </div>
  );
}
