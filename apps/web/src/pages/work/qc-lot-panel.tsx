import { canWorkStage, LOT_STATUS_LABELS, STAGE_LABELS, type LotDetailDto, type LotSummaryDto, type ProjectDetailDto } from '@manpro/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useInvalidateWork } from '@/hooks/use-invalidate-work';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { BulkPanelProps } from './stage-panels';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  sampling: 'outline',
  passed: 'secondary',
  released: 'secondary',
  on_hold: 'destructive',
  reworked: 'outline',
};

/** Panel lot untuk project bermode QC sampling. Tampil hanya kalau project yang dipilih memakai sampling. */
export function QcLotPanel({ projectId }: BulkPanelProps) {
  const project = useQuery({
    queryKey: ['project', String(projectId)],
    queryFn: () => api<ProjectDetailDto>(`/api/projects/${projectId}`),
    enabled: !!projectId,
  });
  if (!projectId || project.data?.qcMode !== 'sampling') return null;
  return <LotManager project={project.data} />;
}

function LotManager({ project }: { project: ProjectDetailDto }) {
  const invalidate = useInvalidateWork();
  const [openLot, setOpenLot] = useState<number | null>(null);
  const lots = useQuery({ queryKey: ['lots', project.id], queryFn: () => api<LotSummaryDto[]>(`/api/projects/${project.id}/lots`) });

  const create = useMutation({
    mutationFn: () => api<LotDetailDto>(`/api/projects/${project.id}/lots`, { method: 'POST' }),
    onSuccess: (l) => {
      toast.success(`Lot ${l.code} dibuat: ${l.size} unit, ${l.sampleSize} sampel`);
      invalidate();
      setOpenLot(l.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lot QC — {project.code}</CardTitle>
        <CardDescription>
          Sampling: lot {formatNumber(project.lotSize ?? 0)} unit, sampel {project.samplePercent}%, lot ditahan kalau sampel gagal lebih dari {project.maxSampleFail}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button className="justify-self-start" disabled={create.isPending} onClick={() => create.mutate()}>
          <Layers /> Bentuk Lot Baru
        </Button>
        {lots.data?.length === 0 && <p className="text-sm text-muted-foreground">Belum ada lot.</p>}
        <div className="grid gap-2">
          {lots.data?.map((l) =>
            openLot === l.id ? (
              <LotDetail key={l.id} lotId={l.id} onClose={() => setOpenLot(null)} />
            ) : (
              <button key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setOpenLot(l.id)}>
                <span>
                  <b>{l.code}</b> · {formatNumber(l.size)} unit · sampel {l.inspected}/{l.sampleSize} diperiksa, {l.failed} gagal
                </span>
                <Badge variant={STATUS_VARIANT[l.status]}>{LOT_STATUS_LABELS[l.status]}</Badge>
              </button>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LotDetail({ lotId, onClose }: { lotId: number; onClose: () => void }) {
  const me = useMe().data!;
  const invalidate = useInvalidateWork();
  const lot = useQuery({ queryKey: ['lots', 'detail', lotId], queryFn: () => api<LotDetailDto>(`/api/lots/${lotId}`) });
  const [note, setNote] = useState('');
  const [reworkTo, setReworkTo] = useState('activation');
  const canDecide = me.role === 'super_admin' || me.role === 'manager' || (me.role === 'leader' && canWorkStage(me, 'qc'));

  const decide = useMutation({
    mutationFn: (action: 'release' | 'rework') => api<LotDetailDto>(`/api/lots/${lotId}/decide`, { method: 'POST', body: { action, reworkTo, note } }),
    onSuccess: (l) => {
      toast.success(`Lot ${l.code}: ${LOT_STATUS_LABELS[l.status]}`);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const l = lot.data;
  if (!l) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b>{l.code}</b>
        <Badge variant={STATUS_VARIANT[l.status]}>{LOT_STATUS_LABELS[l.status]}</Badge>
        <span className="text-sm text-muted-foreground">
          {formatNumber(l.size)} unit · {l.inspected}/{l.sampleSize} sampel diperiksa · {l.failed} gagal (batas {l.maxSampleFail})
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
          Tutup
        </Button>
      </div>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Sampel (scan SN di atas untuk memeriksa):</p>
        <div className="flex flex-wrap gap-1.5">
          {l.samples.map((s) => (
            <span
              key={s.unitId}
              className={`rounded border px-2 py-0.5 font-mono text-xs ${s.result === 'pass' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : s.result === 'fail' ? 'border-destructive bg-destructive/10 text-destructive' : ''}`}
            >
              {s.serialNumber}
            </span>
          ))}
        </div>
      </div>
      {l.decisionNote && <p className="rounded bg-muted px-2 py-1 text-xs">Keputusan: {l.decisionNote}</p>}
      {l.status === 'on_hold' && (
        <div className="grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium">Lot ditahan: sampel gagal melebihi batas.</p>
          {canDecide ? (
            <>
              <Input placeholder="Alasan keputusan (wajib)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" disabled={note.trim().length < 3 || decide.isPending} onClick={() => decide.mutate('release')}>
                  Loloskan lot
                </Button>
                <span className="text-sm text-muted-foreground">atau</span>
                <NativeSelect className="w-40" value={reworkTo} onChange={(e) => setReworkTo(e.target.value)}>
                  <option value="assembling">{STAGE_LABELS.assembling}</option>
                  <option value="activation">{STAGE_LABELS.activation}</option>
                </NativeSelect>
                <Button variant="destructive" disabled={note.trim().length < 3 || decide.isPending} onClick={() => decide.mutate('rework')}>
                  Kembalikan seluruh lot
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Menunggu keputusan Manager atau Leader QC.</p>
          )}
        </div>
      )}
    </div>
  );
}
