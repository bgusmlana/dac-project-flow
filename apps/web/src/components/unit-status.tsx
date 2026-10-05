import { UNIT_STATUS_LABELS, UNIT_STATUSES, type StatusCounts, type UnitStatus } from '@manpro/shared';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';

/** Warna per status, dipakai di badge dan bar progres. */
export const STATUS_COLORS: Record<UnitStatus, string> = {
  assembling: 'bg-amber-500',
  activation: 'bg-sky-500',
  qc: 'bg-violet-500',
  packing: 'bg-orange-500',
  shipping: 'bg-blue-600',
  installation: 'bg-teal-500',
  completed: 'bg-emerald-600',
};

export function UnitStatusBadge({ status, className }: { status: UnitStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap', className)}>
      <span className={cn('size-2 rounded-full', STATUS_COLORS[status])} />
      {UNIT_STATUS_LABELS[status]}
    </span>
  );
}

/** Bar progres bertumpuk: berapa unit di setiap status dibanding jumlah pesanan. */
export function ProgressBar({ counts, total, showLegend = false }: { counts: StatusCounts; total: number; showLegend?: boolean }) {
  const registered = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const denom = Math.max(total, registered, 1);
  const done = counts.completed ?? 0;
  return (
    <div className="grid gap-1.5">
      <Tip
        label={
          <div className="grid gap-1">
            <div>
              {formatNumber(registered)} dari {formatNumber(total)} unit terdaftar
            </div>
            {UNIT_STATUSES.filter((s) => counts[s]).map((s) => (
              <div key={s} className="flex items-center gap-1.5 font-normal">
                <span className={`size-2 rounded-full ${STATUS_COLORS[s]}`} />
                {UNIT_STATUS_LABELS[s]}: {formatNumber(counts[s] ?? 0)}
              </div>
            ))}
          </div>
        }
      >
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {UNIT_STATUSES.map((s) =>
            counts[s] ? <div key={s} className={STATUS_COLORS[s]} style={{ width: `${((counts[s] ?? 0) / denom) * 100}%` }} /> : null,
          )}
        </div>
      </Tip>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
        <span>
          {formatNumber(done)} / {formatNumber(total)} selesai
        </span>
        <span>{formatNumber(registered)} unit terdaftar</span>
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {UNIT_STATUSES.filter((s) => counts[s]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', STATUS_COLORS[s])} />
              {UNIT_STATUS_LABELS[s]} <b>{formatNumber(counts[s] ?? 0)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
