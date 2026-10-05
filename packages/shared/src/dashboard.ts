import type { ProjectSummaryDto, StatusCounts } from './projects.js';

export interface DashboardDto {
  /** Project aktif (draft/berjalan), urut deadline terdekat. */
  projects: ProjectSummaryDto[];
  /** Total unit per status di semua project aktif — tahap dengan antrian terbesar = bottleneck. */
  stageTotals: StatusCounts;
  overdueCount: number;
  dueSoonCount: number;
  lotsOnHold: { id: number; code: string; projectId: string; projectCode: string }[];
  /** Jumlah unit yang menyelesaikan setiap tahap per hari (7 hari terakhir). */
  throughput: { date: string; counts: StatusCounts }[];
  keyStock: { targetName: string; available: number }[];
  recentShipments: { id: string; code: string; projectCode: string; status: string; receivedAt: string | null; shippedAt: string | null }[];
}
