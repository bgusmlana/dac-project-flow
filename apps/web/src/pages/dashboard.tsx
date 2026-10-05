import { canManageProjects, STAGE_LABELS, STAGES, UNIT_STATUS_LABELS, type DashboardDto, type MeDto, type UnitStatus } from '@manpro/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CalendarClock, FolderKanban, KeySquare, Layers, LifeBuoy } from 'lucide-react';
import { Link } from 'react-router';
import { ProgressBar, STATUS_COLORS } from '@/components/unit-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/hooks/use-me';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { myStages, STAGE_ICONS } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Deadline } from './projects/projects-page';

function Stat({ icon: Icon, label, value, tone, to }: { icon: typeof AlertTriangle; label: string; value: number; tone?: 'danger' | 'warn'; to?: string }) {
  const body = (
    <Card className={cn(to && 'transition-shadow hover:shadow-md hover:ring-primary/40', tone === 'danger' && value > 0 && 'border-destructive/50', tone === 'warn' && value > 0 && 'border-orange-400')}>
      <CardContent className="flex items-center gap-3">
        <Icon className={cn('size-5 text-muted-foreground', tone === 'danger' && value > 0 && 'text-destructive', tone === 'warn' && value > 0 && 'text-orange-500')} />
        <div>
          <div className="text-2xl font-semibold tabular-nums">{formatNumber(value)}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** Pintasan ke pekerjaan user: antrian lini divisinya, atau buat project untuk Admin Project. */
function MyWork({ me, stageTotals }: { me: MeDto; stageTotals: DashboardDto['stageTotals'] }) {
  const top = me.role === 'super_admin' || me.role === 'manager';
  if (top) return null;
  const stages = myStages(me);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stages.map((s) => {
        const Icon = STAGE_ICONS[s];
        return (
          <Link key={s} to={`/work/${s}`} className="group">
            <Card className="bg-primary text-primary-foreground ring-0 transition-opacity group-hover:opacity-90">
              <CardContent className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-5" />
                </span>
                <div className="flex-1">
                  <div className="text-xs opacity-80">Antrian Lini {STAGE_LABELS[s]}</div>
                  <div className="text-2xl font-semibold tabular-nums">{formatNumber(stageTotals[s] ?? 0)} unit</div>
                </div>
                <ArrowRight className="size-5 opacity-70 transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>
        );
      })}
      {canManageProjects(me) && (
        <Link to="/projects" className="group">
          <Card className="bg-primary text-primary-foreground ring-0 transition-opacity group-hover:opacity-90">
            <CardContent className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-white/15">
                <FolderKanban className="size-5" />
              </span>
              <div className="flex-1">
                <div className="text-xs opacity-80">Pekerjaan Anda</div>
                <div className="text-lg font-semibold">Buat &amp; kelola project</div>
              </div>
              <ArrowRight className="size-5 opacity-70 transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
      )}
      <Link to="/help" className="group">
        <Card className="h-full transition-colors group-hover:bg-accent">
          <CardContent className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <LifeBuoy className="size-5" />
            </span>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Masih bingung alurnya?</div>
              <div className="font-semibold">Buka Pusat Bantuan</div>
            </div>
            <ArrowRight className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

export function DashboardPage() {
  const me = useMe().data!;
  const d = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardDto>('/api/dashboard'), refetchInterval: 60_000 });

  if (d.isLoading) return <p className="text-muted-foreground">Memuat…</p>;
  if (!d.data) return <p className="text-destructive">{errorMessage(d.error)}</p>;
  const data = d.data;

  const stageQueue = STAGES.map((s) => ({ s, n: data.stageTotals[s] ?? 0 }));
  const maxQueue = Math.max(1, ...stageQueue.map((x) => x.n));
  const bottleneck = stageQueue.reduce((a, b) => (b.n > a.n ? b : a), stageQueue[0]!);
  const maxFlow = Math.max(1, ...data.throughput.flatMap((t) => Object.values(t.counts).map((n) => n ?? 0)));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">Selamat datang, {me.name}</h1>
        <p className="text-sm text-muted-foreground">Ringkasan semua project yang sedang berjalan.</p>
      </div>

      <MyWork me={me} stageTotals={data.stageTotals} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Layers} label="Project aktif" value={data.projects.length} to="/projects" />
        <Stat icon={AlertTriangle} label="Lewat deadline" value={data.overdueCount} tone="danger" />
        <Stat icon={CalendarClock} label="Deadline ≤ 7 hari" value={data.dueSoonCount} tone="warn" />
        <Stat icon={AlertTriangle} label="Lot QC ditahan" value={data.lotsOnHold.length} tone="danger" to="/work/qc" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Antrian per Tahap</CardTitle>
            <CardDescription>
              Jumlah unit yang sedang menunggu / dikerjakan di setiap tahap.
              {bottleneck.n > 0 && (
                <>
                  {' '}
                  Antrian terbanyak: <b>{STAGE_LABELS[bottleneck.s]}</b>.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {stageQueue.map(({ s, n }) => (
              <Link key={s} to={`/work/${s}`} className="grid grid-cols-[6.5rem_1fr_4rem] items-center gap-2 text-sm hover:opacity-80">
                <span>{STAGE_LABELS[s]}</span>
                <span className="h-3 overflow-hidden rounded-full bg-muted">
                  <span className={cn('block h-full', STATUS_COLORS[s])} style={{ width: `${(n / maxQueue) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{formatNumber(n)}</span>
              </Link>
            ))}
            {data.stageTotals.completed ? (
              <p className="text-xs text-muted-foreground">+ {formatNumber(data.stageTotals.completed)} unit sudah selesai di project aktif.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unit Selesai per Tahap (7 hari)</CardTitle>
            <CardDescription>Berapa unit yang menyelesaikan setiap tahap per hari.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 text-left font-normal">Tanggal</th>
                    {STAGES.map((s) => (
                      <th key={s} className="px-1 text-right font-normal">
                        {STAGE_LABELS[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.throughput.map((t) => (
                    <tr key={t.date} className="border-t">
                      <td className="py-1 whitespace-nowrap">{formatDate(t.date)}</td>
                      {STAGES.map((s) => {
                        const n = t.counts[s as UnitStatus] ?? 0;
                        return (
                          <td key={s} className="px-1 text-right tabular-nums" style={{ backgroundColor: n ? `color-mix(in oklch, var(--primary) ${Math.round((n / maxFlow) * 35)}%, transparent)` : undefined }}>
                            {n ? formatNumber(n) : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Aktif</CardTitle>
          <CardDescription>Diurutkan dari deadline terdekat.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.projects.length === 0 && <p className="text-sm text-muted-foreground">Belum ada project aktif.</p>}
          {data.projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="grid gap-1 rounded-lg border p-3 hover:bg-muted/50 md:grid-cols-[1fr_20rem] md:items-center md:gap-4">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{p.code}</span> · {p.clientName} · deadline <Deadline date={p.targetDate} />
                </div>
              </div>
              <ProgressBar counts={p.counts} total={p.totalQuantity} />
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pengiriman Terakhir</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {data.recentShipments.length === 0 && <p className="text-muted-foreground">Belum ada pengiriman.</p>}
            {data.recentShipments.map((s) => (
              <div key={s.id} className="flex justify-between gap-2 border-b py-1 last:border-b-0">
                <span className="font-mono text-xs">{s.code}</span>
                <span className="text-xs text-muted-foreground">
                  {s.status === 'delivered' ? `Diterima ${formatDateTime(s.receivedAt)}` : s.status === 'shipped' ? `Dikirim ${formatDateTime(s.shippedAt)}` : 'Disiapkan'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeySquare className="size-4" /> Stok License Key Tersedia
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {data.keyStock.length === 0 && <p className="text-muted-foreground">Tidak ada key tersedia.</p>}
            {data.keyStock.map((k) => (
              <div key={k.targetName} className="flex justify-between border-b py-1 last:border-b-0">
                <span>{k.targetName}</span>
                <span className={cn('tabular-nums', k.available < 50 && 'font-semibold text-orange-600')}>{formatNumber(k.available)}</span>
              </div>
            ))}
            {data.lotsOnHold.length > 0 && (
              <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs">
                Lot ditahan: {data.lotsOnHold.map((l) => `${l.projectCode} ${l.code}`).join(', ')} — {UNIT_STATUS_LABELS.qc}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
