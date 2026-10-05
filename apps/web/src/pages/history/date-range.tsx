import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Tanggal lokal (zona waktu browser) dalam format YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

export interface Range {
  from: string;
  to: string;
}

const PRESETS: { label: string; range: () => Range }[] = [
  { label: 'Hari ini', range: () => ({ from: daysAgo(0), to: daysAgo(0) }) },
  { label: 'Kemarin', range: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
  { label: '7 hari', range: () => ({ from: daysAgo(6), to: daysAgo(0) }) },
  { label: '30 hari', range: () => ({ from: daysAgo(29), to: daysAgo(0) }) },
  {
    label: 'Bulan ini',
    range: () => {
      const d = new Date();
      return { from: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), to: daysAgo(0) };
    },
  },
];

/** Pilihan rentang tanggal: tombol cepat + tanggal awal/akhir. */
export function DateRangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {PRESETS.map((p) => {
          const r = p.range();
          const active = r.from === value.from && r.to === value.to;
          return (
            <button
              key={p.label}
              type="button"
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground',
                active && 'bg-background text-foreground shadow-sm',
              )}
              onClick={() => onChange(r)}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Input type="date" className="h-8 w-38" aria-label="Dari tanggal" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
        s/d
        <Input type="date" className="h-8 w-38" aria-label="Sampai tanggal" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
      </div>
    </div>
  );
}
