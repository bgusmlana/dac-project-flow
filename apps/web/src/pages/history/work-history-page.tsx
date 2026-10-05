import {
  STAGE_LABELS,
  STAGES,
  UNIT_STATUS_LABELS,
  STAGE_WORK_RESULTS,
  WORK_ACTION_LABELS,
  workResultLabel,
  type DivisionDto,
  type HistoryUserDto,
  type Paginated,
  type ProjectSummaryDto,
  type Stage,
  type WorkAction,
  type WorkHistoryItemDto,
  type WorkSummaryDto,
} from '@manpro/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BadgeCheck, CheckCircle2, Download, ListChecks, RotateCcw, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Pager } from '@/components/list-toolbar';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Field, PageHeader } from '@/components/ui-extra';
import { useMe } from '@/hooks/use-me';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { myStages } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { EmptyRow } from '@/pages/master/master-page';
import { DateRangePicker, daysAgo, type Range } from './date-range';

/** Warna badge hasil pekerjaan. */
function resultVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action === 'rework' || action === 'qc_fail') return 'destructive';
  if (action === 'create' || action === 'unseal') return 'outline';
  return 'secondary';
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone?: 'good' | 'bad' }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground',
            tone === 'good' && 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
            tone === 'bad' && 'bg-destructive/10 text-destructive',
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <div>
          <div className="text-xl font-semibold tabular-nums">{formatNumber(value)}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pilihan "Hasil" untuk tahap-tahap ini. Label khusus tahap kalau jelas, label umum kalau bercampur. */
function resultOptionsFor(stages: Stage[], isTop: boolean): { action: WorkAction; label: string }[] {
  const all = new Map<WorkAction, string>();
  for (const st of stages) {
    for (const o of STAGE_WORK_RESULTS[st]) all.set(o.action, all.has(o.action) ? WORK_ACTION_LABELS[o.action] : o.label);
  }
  // Pendaftaran unit (Admin Project) hanya relevan untuk pandangan semua tahap milik Manager/Super Admin.
  if (isTop && stages.length > 1) all.set('create', WORK_ACTION_LABELS.create);
  return [...all].map(([action, label]) => ({ action, label }));
}

export function WorkHistoryPage() {
  const me = useMe().data!;
  const isStaff = me.role === 'staff';
  const isTop = me.role === 'super_admin' || me.role === 'manager';

  const [range, setRange] = useState<Range>({ from: daysAgo(6), to: daysAgo(0) });
  const [userId, setUserId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  /**
   * null = belum dipilih → bawaan: 1 project aktif = project itu; lebih dari 1 = semua project aktif; tidak ada = semua.
   * 'active' = semua project aktif, '' = semua termasuk yang selesai, angka = satu project.
   */
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const [stageChoice, setStageChoice] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'summary' | 'list'>(isStaff ? 'list' : 'summary');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const projects = useQuery({ queryKey: ['projects', 'options'], queryFn: () => api<Paginated<ProjectSummaryDto>>('/api/projects?page=1&pageSize=100') });
  const activeProjects = (projects.data?.data ?? []).filter((p) => p.status === 'draft' || p.status === 'in_progress');
  const otherProjects = (projects.data?.data ?? []).filter((p) => p.status !== 'draft' && p.status !== 'in_progress');
  const defaultProject = activeProjects.length === 1 ? String(activeProjects[0]!.id) : activeProjects.length > 1 ? 'active' : '';
  const projectValue = projectChoice ?? defaultProject;

  // Tahap yang relevan: Manager & Super Admin semua tahap, divisi hanya tahapnya sendiri.
  const stageOptions: Stage[] = isTop ? [...STAGES] : myStages(me);
  const stage = stageOptions.length === 1 ? stageOptions[0]! : stageChoice;
  const resultOptions = resultOptionsFor(stage ? [stage as Stage] : stageOptions, isTop);

  const filter = new URLSearchParams({ from: range.from, to: range.to });
  if (userId) filter.set('userId', userId);
  if (divisionId) filter.set('divisionId', divisionId);
  if (projectValue === 'active') filter.set('projectStatus', 'active');
  else if (projectValue) filter.set('projectId', projectValue);
  if (stage) filter.set('stage', stage);
  if (action) filter.set('action', action);
  if (search.trim()) filter.set('search', search.trim());
  const listParams = new URLSearchParams(filter);
  listParams.set('page', String(page));
  listParams.set('pageSize', String(pageSize));

  /** Setiap filter berubah → kembali ke halaman 1. */
  const set =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };

  const users = useQuery({ queryKey: ['work-history', 'users'], queryFn: () => api<HistoryUserDto[]>('/api/work-history/users'), enabled: !isStaff });
  const divisions = useQuery({ queryKey: ['divisions'], queryFn: () => api<DivisionDto[]>('/api/divisions'), enabled: isTop });
  const summary = useQuery({
    queryKey: ['work-history', 'summary', filter.toString()],
    queryFn: () => api<WorkSummaryDto>(`/api/work-history/summary?${filter}`),
    placeholderData: keepPreviousData,
  });
  const list = useQuery({
    queryKey: ['work-history', 'list', listParams.toString()],
    queryFn: () => api<Paginated<WorkHistoryItemDto>>(`/api/work-history?${listParams}`),
    placeholderData: keepPreviousData,
    enabled: tab === 'list',
  });

  const isFiltered =
    !!userId || !!divisionId || (projectChoice !== null && projectChoice !== defaultProject) || !!stageChoice || !!action || !!search || range.from !== daysAgo(6) || range.to !== daysAgo(0);
  function resetFilters() {
    setRange({ from: daysAgo(6), to: daysAgo(0) });
    setUserId('');
    setDivisionId('');
    setProjectChoice(null);
    setStageChoice('');
    setAction('');
    setSearch('');
    setPage(1);
  }

  const totals = (summary.data?.byUser ?? []).reduce(
    (a, u) => ({ total: a.total + u.total, advance: a.advance + u.advance, qcPass: a.qcPass + u.qcPass, rework: a.rework + u.rework }),
    { total: 0, advance: 0, qcPass: 0, rework: 0 },
  );

  const includesQc = stage ? stage === 'qc' : stageOptions.includes('qc');
  const onlyQc = stage === 'qc';
  const columns: SummaryColumns = { division: isTop, advance: !onlyQc, qc: includesQc, create: isTop && !stage };
  const stats: { icon: typeof Users; label: string; value: number; tone?: 'good' | 'bad' }[] = [
    { icon: ListChecks, label: 'Total pekerjaan', value: totals.total },
    ...(onlyQc ? [] : [{ icon: CheckCircle2, label: stage ? `Selesai ${STAGE_LABELS[stage as Stage]}` : 'Tahap diselesaikan', value: totals.advance, tone: 'good' as const }]),
    ...(includesQc
      ? [
          { icon: BadgeCheck, label: 'Lulus QC', value: totals.qcPass, tone: 'good' as const },
          { icon: RotateCcw, label: 'Gagal QC / rework', value: totals.rework, tone: 'bad' as const },
        ]
      : []),
  ];

  const description = isStaff
    ? 'Semua pekerjaan yang pernah Anda kerjakan: unit yang diselesaikan, lulus/gagal QC, dan dikembalikan.'
    : me.role === 'leader'
      ? `Pekerjaan semua anggota divisi ${me.divisionName ?? ''} Anda, lengkap dengan rekap per orang per hari.`
      : 'Pekerjaan semua divisi, lengkap dengan rekap per petugas per hari.';

  return (
    <div className="grid gap-4">
      <PageHeader title="Riwayat Pekerjaan" description={description}>
        <Button variant="outline" tooltip="Unduh rekap & daftar riwayat sesuai filter" onClick={() => window.open(`/api/work-history/export?${filter}`, '_blank')}>
          <Download /> Export Excel
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="grid gap-3">
          <Field label="Periode" group>
            <DateRangePicker value={range} onChange={set(setRange)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {isTop && (
              <Field label="Divisi">
                <NativeSelect value={divisionId} onChange={(e) => set(setDivisionId)(e.target.value)}>
                  <option value="">Semua divisi</option>
                  {divisions.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {!isStaff && (
              <Field label="Petugas">
                <NativeSelect value={userId} onChange={(e) => set(setUserId)(e.target.value)}>
                  <option value="">{me.role === 'leader' ? 'Semua anggota divisi' : 'Semua petugas'}</option>
                  {users.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {isTop && u.divisionName ? ` · ${u.divisionName}` : ''}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Project">
              <NativeSelect value={projectValue} onChange={(e) => set(setProjectChoice)(e.target.value)}>
                {activeProjects.length > 0 && <option value="active">Semua project</option>}
                {activeProjects.length > 0 && (
                  <optgroup label="Project aktif">
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherProjects.length > 0 && (
                  <optgroup label="Project selesai / dibatalkan">
                    {otherProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {(activeProjects.length === 0 || otherProjects.length > 0) && (
                  <option value="">{activeProjects.length === 0 ? 'Semua project' : 'Semua project (termasuk yang selesai)'}</option>
                )}
              </NativeSelect>
            </Field>
            {stageOptions.length > 0 && (
              <Field label="Tahap">
                <NativeSelect
                  value={stage}
                  disabled={stageOptions.length === 1}
                  onChange={(e) => {
                    set(setStageChoice)(e.target.value);
                    setAction('');
                  }}
                >
                  {stageOptions.length > 1 && <option value="">{isTop ? 'Semua tahap' : 'Semua tahap saya'}</option>}
                  {stageOptions.map((st) => (
                    <option key={st} value={st}>
                      {STAGE_LABELS[st]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {resultOptions.length > 1 && (
              <Field label="Hasil">
                <NativeSelect value={action} onChange={(e) => set(setAction)(e.target.value)}>
                  <option value="">Semua hasil</option>
                  {resultOptions.map((o) => (
                    <option key={o.action} value={o.action}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Serial number">
              <Input placeholder="Ketik / scan SN unit…" value={search} onChange={(e) => set(setSearch)(e.target.value)} />
            </Field>
          </div>
          {isFiltered && (
            <Button variant="ghost" size="sm" className="justify-self-start" onClick={resetFilters}>
              <RotateCcw /> Kembalikan filter bawaan
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Kotak ringkas menyesuaikan tahap: QC → lulus & gagal; tahap lain → unit diselesaikan. */}
      <div className={cn('grid grid-cols-2 gap-3', ({ 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' } as Record<number, string>)[stats.length])}>
        {stats.map((st) => (
          <Stat key={st.label} {...st} />
        ))}
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1 sm:w-fit">
        {(
          [
            ['summary', isStaff ? 'Rekap per Hari' : 'Rekap per Petugas'],
            ['list', 'Daftar Riwayat'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={cn(
              'flex-1 rounded-md px-4 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-background hover:text-foreground',
              tab === k && 'bg-background text-foreground shadow-sm',
            )}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="grid gap-4">
          {!isStaff && (
            <Card>
              <CardHeader>
                <CardTitle>Total per Petugas</CardTitle>
                <CardDescription>
                  {formatDate(range.from)} – {formatDate(range.to)}. Klik nama untuk melihat daftar pekerjaannya.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SummaryTable
                  columns={columns}
                  rows={summary.data?.byUser ?? []}
                  loading={summary.isLoading}
                  onPick={(id) => {
                    if (!id) return;
                    setUserId(id);
                    setPage(1);
                    setTab('list');
                  }}
                />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Rincian per Hari</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryTable columns={columns} rows={summary.data?.byDay ?? []} loading={summary.isLoading} showDate hideUser={isStaff} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'list' && (
        <Card>
          <CardContent className="grid gap-3">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Tahap</TableHead>
                    <TableHead>Hasil</TableHead>
                    {!isStaff && <TableHead>Petugas</TableHead>}
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.isLoading && <EmptyRow cols={7} text="Memuat…" />}
                  {list.data?.data.length === 0 && <EmptyRow cols={7} text="Tidak ada pekerjaan pada rentang tanggal & filter ini." />}
                  {list.data?.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell>
                        <Link to={`/units/${r.unitId}`} className="font-mono text-primary underline-offset-4 hover:underline">
                          {r.serialNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.projectCode}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.fromStatus ? UNIT_STATUS_LABELS[r.fromStatus] : 'Project'}
                        {r.fromStatus !== r.toStatus && <span className="text-muted-foreground"> → {UNIT_STATUS_LABELS[r.toStatus]}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={resultVariant(r.action)}>{workResultLabel(r.action, r.fromStatus, r.toStatus)}</Badge>
                      </TableCell>
                      {!isStaff && (
                        <TableCell className="text-sm">
                          {r.userName ?? 'sistem'}
                          {isTop && r.divisionName && <div className="text-xs text-muted-foreground">{r.divisionName}</div>}
                        </TableCell>
                      )}
                      <TableCell className="max-w-72 text-xs text-muted-foreground">{r.note ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {list.data && <Pager page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} unit="pekerjaan" />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface SummaryColumns {
  division: boolean;
  advance: boolean;
  qc: boolean;
  create: boolean;
}

function SummaryTable({
  columns,
  rows,
  loading,
  showDate,
  hideUser,
  onPick,
}: {
  columns: SummaryColumns;
  rows: (Omit<WorkSummaryDto['byDay'][number], 'date'> & { date?: string })[];
  loading: boolean;
  showDate?: boolean;
  hideUser?: boolean;
  onPick?: (userId: string | null) => void;
}) {
  const cols = 2 + (showDate ? 1 : 0) - (hideUser ? 1 : 0) + (columns.division && !hideUser ? 1 : 0) + (columns.advance ? 1 : 0) + (columns.qc ? 2 : 0) + (columns.create ? 1 : 0);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {showDate && <TableHead>Tanggal</TableHead>}
            {!hideUser && <TableHead>Petugas</TableHead>}
            {!hideUser && columns.division && <TableHead>Divisi</TableHead>}
            {columns.advance && <TableHead className="text-right">Tahap selesai</TableHead>}
            {columns.qc && <TableHead className="text-right">Lulus QC</TableHead>}
            {columns.qc && <TableHead className="text-right">Gagal / rework</TableHead>}
            {columns.create && <TableHead className="text-right">Didaftarkan</TableHead>}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && <EmptyRow cols={cols} text="Memuat…" />}
          {!loading && rows.length === 0 && <EmptyRow cols={cols} text="Belum ada pekerjaan pada rentang tanggal ini." />}
          {rows.map((r) => (
            <TableRow key={`${r.date ?? ''}|${r.userId ?? ''}`}>
              {showDate && <TableCell className="whitespace-nowrap">{formatDate(r.date!)}</TableCell>}
              {!hideUser && (
                <TableCell>
                  {onPick && r.userId ? (
                    <button className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onPick(r.userId)}>
                      {r.userName}
                    </button>
                  ) : (
                    (r.userName ?? 'sistem')
                  )}
                </TableCell>
              )}
              {!hideUser && columns.division && <TableCell className="text-muted-foreground">{r.divisionName ?? '—'}</TableCell>}
              {columns.advance && <TableCell className="text-right tabular-nums">{formatNumber(r.advance)}</TableCell>}
              {columns.qc && <TableCell className="text-right tabular-nums">{r.qcPass ? formatNumber(r.qcPass) : '—'}</TableCell>}
              {columns.qc && (
                <TableCell className={cn('text-right tabular-nums', r.rework > 0 && 'font-medium text-destructive')}>{r.rework ? formatNumber(r.rework) : '—'}</TableCell>
              )}
              {columns.create && <TableCell className="text-right tabular-nums">{r.create ? formatNumber(r.create) : '—'}</TableCell>}
              <TableCell className="text-right font-semibold tabular-nums">{formatNumber(r.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
