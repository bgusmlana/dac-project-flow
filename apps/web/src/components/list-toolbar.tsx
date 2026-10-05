import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useState } from 'react';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';

/** Kolom pencarian + centang "tampilkan nonaktif" yang dipakai di halaman daftar. */
export function ListToolbar({
  search,
  onSearch,
  includeInactive,
  onIncludeInactive,
  children,
}: {
  search: string;
  onSearch: (v: string) => void;
  includeInactive: boolean;
  onIncludeInactive: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input placeholder="Cari…" className="max-w-xs" value={search} onChange={(e) => onSearch(e.target.value)} />
      {children}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={includeInactive} onChange={(e) => onIncludeInactive(e.target.checked)} />
        Tampilkan yang nonaktif
      </label>
    </div>
  );
}

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

/** Nomor halaman yang ditampilkan, dengan "…" untuk loncatan (misalnya 1 … 4 5 6 … 400). */
function pageNumbers(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((n) => set.add(n));
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1]! > 1) out.push('…');
    out.push(n);
  });
  return out;
}

/**
 * Paginasi tabel: info "Menampilkan 1–50 dari 20.000", pilihan jumlah baris,
 * tombol ke halaman pertama/sebelumnya/nomor/berikutnya/terakhir, dan loncat ke halaman tertentu.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  unit = 'data',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  /** Kalau diisi, pengguna bisa memilih jumlah baris per halaman. */
  onPageSize?: (size: number) => void;
  /** Satuan data, misalnya "unit" atau "project". */
  unit?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const [jump, setJump] = useState('');
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
        <span>
          Menampilkan <b className="font-medium text-foreground tabular-nums">{formatNumber(from)}–{formatNumber(to)}</b> dari{' '}
          <b className="font-medium text-foreground tabular-nums">{formatNumber(total)}</b> {unit}
        </span>
        {onPageSize && (
          <label className="flex items-center gap-1.5">
            Tampilkan
            <NativeSelect
              className="h-7 w-auto pr-7"
              value={pageSize}
              onChange={(e) => {
                onPageSize(Number(e.target.value));
                onPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
            baris
          </label>
        )}
      </div>

      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="icon-sm" tooltip="Halaman pertama" disabled={page <= 1} onClick={() => onPage(1)}>
            <ChevronsLeft />
          </Button>
          <Button variant="outline" size="icon-sm" tooltip="Halaman sebelumnya" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft />
          </Button>
          {pageNumbers(page, pages).map((n, i) =>
            n === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={n}
                variant={n === page ? 'default' : 'ghost'}
                size="sm"
                className="min-w-7 px-1.5 tabular-nums"
                aria-current={n === page ? 'page' : undefined}
                onClick={() => onPage(n)}
              >
                {formatNumber(n)}
              </Button>
            ),
          )}
          <Button variant="outline" size="icon-sm" tooltip="Halaman berikutnya" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight />
          </Button>
          <Button variant="outline" size="icon-sm" tooltip="Halaman terakhir" disabled={page >= pages} onClick={() => onPage(pages)}>
            <ChevronsRight />
          </Button>
          {pages > 7 && (
            <form
              className="ml-1 flex items-center gap-1 text-muted-foreground"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(jump);
                if (Number.isInteger(n) && n >= 1) onPage(Math.min(n, pages));
                setJump('');
              }}
            >
              <Input
                className="h-7 w-16 px-2 text-center"
                inputMode="numeric"
                placeholder="Hal."
                aria-label="Loncat ke halaman"
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
              />
              <Button type="submit" variant="outline" size="sm" disabled={!jump}>
                Buka
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** State halaman + jumlah baris per halaman untuk satu tabel. */
export function usePaging(defaultSize = 50) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultSize);
  return { page, setPage, pageSize, setPageSize };
}
