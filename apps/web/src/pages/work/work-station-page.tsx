import {
  canWorkStage,
  STAGE_LABELS,
  STAGES,
  UNIT_STATUS_LABELS,
  type Paginated,
  type Stage,
  type UnitDetailDto,
  type WorkProjectDto,
  type WorkQueueItemDto,
} from '@manpro/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, ScanLine, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Pager } from '@/components/list-toolbar';
import { NativeSelect } from '@/components/native-select';
import { UnitStatusBadge } from '@/components/unit-status';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui-extra';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { EmptyRow } from '@/pages/master/master-page';
import { STAGE_PANELS, STAGE_DESCRIPTIONS } from './stage-panels';


export function WorkStationPage() {
  const { stage } = useParams() as { stage: Stage };
  if (!STAGES.includes(stage)) return <p>Tahap tidak dikenal.</p>;
  return <WorkStation key={stage} stage={stage} />;
}

function WorkStation({ stage }: { stage: Stage }) {
  const me = useMe().data!;
  const canWork = canWorkStage(me, stage);
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [scan, setScan] = useState('');
  const [unit, setUnit] = useState<UnitDetailDto | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const Panel = STAGE_PANELS[stage];

  const projects = useQuery({
    queryKey: ['work', stage, 'projects'],
    queryFn: () => api<WorkProjectDto[]>(`/api/work/${stage}/projects`),
  });
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (projectId) params.set('projectId', projectId);
  if (search.trim()) params.set('search', search.trim());
  const queue = useQuery({
    queryKey: ['work', stage, 'queue', params.toString()],
    queryFn: () => api<Paginated<WorkQueueItemDto>>(`/api/work/${stage}?${params}`),
    placeholderData: keepPreviousData,
  });

  async function openUnit(sn: string) {
    try {
      const u = await api<UnitDetailDto>(`/api/units/lookup?sn=${encodeURIComponent(sn.trim())}`);
      if (u.status !== stage) {
        toast.error(`Unit ${u.serialNumber} sedang di tahap ${UNIT_STATUS_LABELS[u.status]}, bukan ${STAGE_LABELS[stage]}`);
        return;
      }
      setUnit(u);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  /** Dipanggil panel setelah unit selesai / berubah. */
  function onUnitDone() {
    setUnit(null);
    setTimeout(() => scanRef.current?.focus(), 0);
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={`Lini ${STAGE_LABELS[stage]}`} description={STAGE_DESCRIPTIONS[stage]}>
        <Link to={`/help#${stage}`} className={buttonVariants({ variant: 'outline' })}>
          <BookOpen /> Panduan
        </Link>
      </PageHeader>
      {!canWork && <p className="rounded-lg border bg-muted/40 p-3 text-sm">Anda hanya bisa melihat antrian tahap ini. Pekerjaan dilakukan oleh divisi {STAGE_LABELS[stage]}.</p>}

      {canWork && Panel.bulk && <Panel.bulk canWork={canWork} projectId={projectId || null} />}
      {canWork && Panel.unit && (
          <Card>
            <CardContent className="grid gap-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (scan.trim()) openUnit(scan);
                  setScan('');
                }}
              >
                <div className="relative w-full max-w-md">
                  <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input ref={scanRef} autoFocus className="pl-8 font-mono" placeholder="Scan serial number unit…" value={scan} onChange={(e) => setScan(e.target.value)} />
                </div>
                <Button type="submit" variant="outline">
                  Buka
                </Button>
              </form>
              {unit && Panel.unit && (
                <div className="rounded-lg border p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Link to={`/units/${unit.id}`} className="font-mono text-lg font-semibold text-primary underline-offset-4 hover:underline">
                      {unit.serialNumber}
                    </Link>
                    <UnitStatusBadge status={unit.status} />
                    <span className="text-sm text-muted-foreground">
                      {unit.itemLabel} · {unit.projectCode}
                    </span>
                    <Button variant="ghost" size="icon-sm" className="ml-auto" tooltip="Tutup panel unit" onClick={() => setUnit(null)}>
                      <X />
                    </Button>
                  </div>
                  <Panel.unit unit={unit} onChange={setUnit} onDone={onUnitDone} />
                </div>
              )}
            </CardContent>
          </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Antrian {STAGE_LABELS[stage]} {queue.data && <span className="text-muted-foreground">({formatNumber(queue.data.total)} unit)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <NativeSelect
              className="w-72"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua project</option>
              {projects.data?.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.code} · {p.name} ({formatNumber(p.count)})
                </option>
              ))}
            </NativeSelect>
            <Input
              className="max-w-xs"
              placeholder="Cari serial number…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Terakhir diperbarui</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.isLoading && <EmptyRow cols={4} text="Memuat…" />}
                {queue.data?.data.length === 0 && <EmptyRow cols={4} text="Tidak ada unit di antrian." />}
                {queue.data?.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      {canWork && Panel.unit ? (
                        <button className="font-mono text-primary underline-offset-4 hover:underline" onClick={() => openUnit(u.serialNumber)}>
                          {u.serialNumber}
                        </button>
                      ) : (
                        <Link to={`/units/${u.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                          {u.serialNumber}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>{u.itemLabel}</TableCell>
                    <TableCell className="font-mono text-xs">{u.projectCode}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(u.since)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {queue.data && <Pager page={page} pageSize={pageSize} total={queue.data.total} onPage={setPage} onPageSize={setPageSize} unit="unit" />}
        </CardContent>
      </Card>
    </div>
  );
}
