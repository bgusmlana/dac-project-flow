import type { PackageDetailDto, Paginated, ProjectDetailDto, ShipmentDetailDto, UnitDto } from '@manpro/shared';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';

export function Barcode({ value, height = 50, fontSize = 14 }: { value: string; height?: number; fontSize?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, value, { format: 'CODE128', height, fontSize, margin: 0, width: 1.6 });
  }, [value, height, fontSize]);
  return <svg ref={ref} />;
}

/** Kerangka halaman cetak: tombol cetak disembunyikan saat dicetak. */
function PrintShell({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div className="min-h-svh bg-white p-6 text-black print:p-0">
      <style>{'@media print { @page { margin: 12mm } .no-print { display: none !important } }'}</style>
      <div className="no-print mb-4 flex gap-2">
        <button className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-black/80" onClick={() => window.print()}>
          Cetak
        </button>
        <button className="rounded-md border px-4 py-2 text-sm hover:bg-gray-100" onClick={() => window.close()}>
          Tutup
        </button>
      </div>
      {children}
    </div>
  );
}

function useData<T>(key: unknown[], url: string, enabled = true) {
  return useQuery({ queryKey: ['print', ...key], queryFn: () => api<T>(url), enabled });
}

function Loading({ q }: { q: { isLoading: boolean; error: unknown } }) {
  return <p className="p-6">{q.isLoading ? 'Memuat…' : errorMessage(q.error)}</p>;
}

// ---------------------------------------------------------------------------
// Label koli + packing list
// ---------------------------------------------------------------------------
export function PrintPackagePage() {
  const { id } = useParams();
  const pkg = useData<PackageDetailDto>(['package', id], `/api/packages/${id}`);
  const project = useData<ProjectDetailDto>(['project', pkg.data?.projectId], `/api/projects/${pkg.data?.projectId}`, !!pkg.data);
  if (!pkg.data || !project.data) return <Loading q={pkg.data ? project : pkg} />;
  const p = pkg.data;
  const pr = project.data;
  return (
    <PrintShell title={`Packing ${p.code}`}>
      <section className="mb-8 border-2 border-black p-4" style={{ breakAfter: 'page' }}>
        <div className="text-sm">{pr.clientName}</div>
        <div className="text-xs">{pr.shippingAddress}</div>
        <div className="mt-3 text-xs">
          Project: {pr.code} · {pr.name}
          {pr.poNumber ? ` · PO ${pr.poNumber}` : ''}
        </div>
        <div className="my-4">
          <Barcode value={p.code} height={80} fontSize={20} />
        </div>
        <div className="text-lg font-bold">
          {formatNumber(p.unitCount)} unit{p.weightKg ? ` · ${p.weightKg} kg` : ''}
        </div>
      </section>

      <section>
        <h1 className="text-xl font-bold">PACKING LIST</h1>
        <table className="mt-2 mb-4 text-sm">
          <tbody>
            <tr><td className="pr-4">Koli</td><td className="font-mono">{p.code}</td></tr>
            <tr><td className="pr-4">Project</td><td>{pr.code} · {pr.name}</td></tr>
            <tr><td className="pr-4">Client</td><td>{pr.clientName}</td></tr>
            <tr><td className="pr-4">Disegel</td><td>{formatDateTime(p.sealedAt)} · {p.packedByName}</td></tr>
          </tbody>
        </table>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-black text-left">
              <th className="py-1">No</th>
              <th>Serial Number</th>
              <th>Produk</th>
              <th>Kelengkapan</th>
            </tr>
          </thead>
          <tbody>
            {p.units.map((u, i) => (
              <tr key={u.id} className="border-b">
                <td className="py-1">{i + 1}</td>
                <td className="font-mono">{u.serialNumber}</td>
                <td>{u.itemLabel}</td>
                <td className="text-xs">{u.accessories.map((a) => `${a.name}${a.serialNumber ? ` (${a.serialNumber})` : ''}`).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PrintShell>
  );
}

// ---------------------------------------------------------------------------
// Surat jalan
// ---------------------------------------------------------------------------
export function PrintShipmentPage() {
  const { id } = useParams();
  const s = useData<ShipmentDetailDto>(['shipment', id], `/api/shipments/${id}`);
  const project = useData<ProjectDetailDto>(['project', s.data?.projectId], `/api/projects/${s.data?.projectId}`, !!s.data);
  if (!s.data || !project.data) return <Loading q={s.data ? project : s} />;
  const d = s.data;
  const pr = project.data;
  return (
    <PrintShell title={`Surat Jalan ${d.code}`}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">SURAT JALAN</h1>
          <div className="font-mono">{d.code}</div>
        </div>
        <Barcode value={d.code} height={40} fontSize={12} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-semibold">Kepada:</div>
          <div>{d.clientName}</div>
          <div className="whitespace-pre-line">{d.shippingAddress}</div>
        </div>
        <div>
          <div>Tanggal kirim: {formatDate(d.shippedAt ?? new Date().toISOString())}</div>
          <div>Project: {pr.code} · {pr.name}</div>
          {pr.poNumber && <div>No. PO: {pr.poNumber}</div>}
          <div>Ekspedisi: {d.courierName ?? '—'}{d.trackingNumber ? ` · Resi ${d.trackingNumber}` : ''}</div>
          {d.vehicleInfo && <div>Kendaraan: {d.vehicleInfo}</div>}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-black text-left">
            <th className="py-1">No</th>
            <th>Koli</th>
            <th className="text-right">Jumlah unit</th>
            <th className="text-right">Berat</th>
          </tr>
        </thead>
        <tbody>
          {d.packages.map((p, i) => (
            <tr key={p.id} className="border-b">
              <td className="py-1">{i + 1}</td>
              <td className="font-mono">{p.code}</td>
              <td className="text-right">{formatNumber(p.unitCount)}</td>
              <td className="text-right">{p.weightKg ? `${p.weightKg} kg` : '—'}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-black font-semibold">
            <td className="py-1" colSpan={2}>
              Total {d.packages.length} koli
            </td>
            <td className="text-right">{formatNumber(d.unitCount)}</td>
            <td className="text-right">{d.packages.some((p) => p.weightKg) ? `${d.packages.reduce((a, p) => a + (p.weightKg ?? 0), 0).toFixed(1)} kg` : ''}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs">Rincian serial number per koli tercantum pada packing list di masing-masing koli.</p>

      <div className="mt-16 grid grid-cols-3 gap-8 text-center text-sm">
        {['Pengirim', 'Ekspedisi / Sopir', 'Penerima'].map((r) => (
          <div key={r}>
            <div>{r}</div>
            <div className="mt-20 border-t border-black pt-1">{r === 'Penerima' && d.receivedByName ? d.receivedByName : '(nama & tanda tangan)'}</div>
          </div>
        ))}
      </div>
    </PrintShell>
  );
}

// ---------------------------------------------------------------------------
// Label barcode SN unit (untuk ditempel di unit/dus unit)
// ---------------------------------------------------------------------------
export function PrintUnitLabelsPage() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const itemId = params.get('itemId');
  const q = new URLSearchParams({ page: String(page), pageSize: '200' });
  if (itemId) q.set('projectItemId', itemId);
  const units = useData<Paginated<UnitDto>>(['unit-labels', projectId, q.toString()], `/api/projects/${projectId}/units?${q}`);
  if (!units.data) return <Loading q={units} />;
  const pages = Math.ceil(units.data.total / 200);
  const sorted = [...units.data.data].sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
  return (
    <PrintShell title="Label Unit">
      <div className="no-print mb-4 text-sm">
        Halaman {page} dari {pages} (200 label per halaman) ·{' '}
        {page > 1 && <a className="text-blue-700 underline hover:text-blue-900" href={`?${new URLSearchParams({ ...(itemId ? { itemId } : {}), page: String(page - 1) })}`}>Sebelumnya</a>}{' '}
        {page < pages && <a className="text-blue-700 underline hover:text-blue-900" href={`?${new URLSearchParams({ ...(itemId ? { itemId } : {}), page: String(page + 1) })}`}>Berikutnya</a>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {sorted.map((u) => (
          <div key={u.id} className="flex flex-col items-center border p-2" style={{ breakInside: 'avoid' }}>
            <Barcode value={u.serialNumber} height={40} fontSize={12} />
            <div className="mt-1 text-[10px]">{u.itemLabel}</div>
          </div>
        ))}
      </div>
    </PrintShell>
  );
}
