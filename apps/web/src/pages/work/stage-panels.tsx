import type { Stage, UnitDetailDto } from '@manpro/shared';
import { ActivationBulkPanel } from './activation-bulk-panel';
import { ActivationPanel } from './activation-panel';
import { AssemblingPanel } from './assembling-panel';
import { InstallationPanel } from './installation-panel';
import { PackingPanel } from './packing-panel';
import { QcLotPanel } from './qc-lot-panel';
import { QcPanel } from './qc-panel';
import { ShippingPanel } from './shipping-panel';

export interface UnitPanelProps {
  unit: UnitDetailDto;
  /** Data unit berubah (misalnya komponen ditambah). */
  onChange: (u: UnitDetailDto) => void;
  /** Unit selesai di tahap ini → kembali ke scan berikutnya. */
  onDone: () => void;
}

export interface BulkPanelProps {
  canWork: boolean;
  projectId: string | null;
}

/**
 * Panel kerja per tahap.
 * - `unit`: dikerjakan per unit setelah scan SN (assembling, aktivasi, QC).
 * - `bulk`: dikerjakan per kelompok (aktivasi massal, lot QC, koli, pengiriman, instalasi).
 */
export const STAGE_PANELS: Record<Stage, { unit?: React.ComponentType<UnitPanelProps>; bulk?: React.ComponentType<BulkPanelProps> }> = {
  assembling: { unit: AssemblingPanel },
  activation: { unit: ActivationPanel, bulk: ActivationBulkPanel },
  qc: { unit: QcPanel, bulk: QcLotPanel },
  packing: { bulk: PackingPanel },
  shipping: { bulk: ShippingPanel },
  installation: { bulk: InstallationPanel },
};

export const STAGE_DESCRIPTIONS: Record<Stage, string> = {
  assembling: 'Scan unit, catat komponen yang dipasang beserta serial number-nya, lalu selesaikan.',
  activation: 'Scan unit, catat aktivasi OS & software beserta license key-nya, lalu selesaikan. Untuk project besar pakai Aktivasi Massal.',
  qc: 'Periksa unit sesuai checklist QC jenis produknya. Unit gagal dikembalikan ke tahap sebelumnya.',
  packing: 'Buat koli/dus, scan unit ke dalamnya, lalu segel.',
  shipping: 'Buat pengiriman, scan koli yang dikirim, catat resi dan bukti terima.',
  installation: 'Catat instalasi di lokasi client beserta dokumentasinya.',
};
