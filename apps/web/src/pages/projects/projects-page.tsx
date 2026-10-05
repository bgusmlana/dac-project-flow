import { canManageProjects, PROJECT_STATUS_LABELS, PROJECT_STATUSES, type Paginated, type ProjectStatus, type ProjectSummaryDto } from '@manpro/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Pager } from '@/components/list-toolbar';
import { NativeSelect } from '@/components/native-select';
import { ProgressBar } from '@/components/unit-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tip } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui-extra';
import { useMe } from '@/hooks/use-me';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { EmptyRow } from '@/pages/master/master-page';
import { ProjectFormDialog } from './project-form';


export const PROJECT_STATUS_VARIANT: Record<ProjectStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  in_progress: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
};

/** Tampilkan tanggal target dengan warna peringatan kalau sudah dekat / lewat. */
export function Deadline({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const days = Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86_400_000);
  const cls = done ? '' : days < 0 ? 'text-destructive font-medium' : days <= 7 ? 'text-orange-600 font-medium' : '';
  return (
    <Tip label={done ? null : days < 0 ? `Lewat ${-days} hari` : days === 0 ? 'Hari ini' : `${days} hari lagi`}>
      <span className={cls}>{formatDate(date)}</span>
    </Tip>
  );
}

export function ProjectsPage() {
  const me = useMe().data!;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) params.set('search', search.trim());
  if (status) params.set('status', status);

  const list = useQuery({
    queryKey: ['projects', params.toString()],
    queryFn: () => api<Paginated<ProjectSummaryDto>>(`/api/projects?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="grid gap-4">
      <PageHeader title="Project" description="Semua project pengadaan dan progres unitnya.">
        {canManageProjects(me) && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> Project Baru
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Cari kode, nama, PO, client…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <NativeSelect
          className="w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua status</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead className="w-72">Progres</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && <EmptyRow cols={5} text="Memuat…" />}
            {list.data?.data.length === 0 && <EmptyRow cols={5} text="Belum ada project." />}
            {list.data?.data.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link to={`/projects/${p.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">
                    {p.code}
                    {p.poNumber ? ` · PO ${p.poNumber}` : ''}
                  </div>
                </TableCell>
                <TableCell className="max-w-48 truncate">{p.clientName}</TableCell>
                <TableCell>
                  <Deadline date={p.targetDate} done={p.status === 'completed' || p.status === 'cancelled'} />
                </TableCell>
                <TableCell>
                  <ProgressBar counts={p.counts} total={p.totalQuantity} />
                </TableCell>
                <TableCell>
                  <Badge variant={PROJECT_STATUS_VARIANT[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {list.data && <Pager page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} unit="project" />}
      {creating && <ProjectFormDialog project={null} onClose={() => setCreating(false)} />}
    </div>
  );
}
