import type { CustomFieldInput, QcItemType, Stage, StageRequirement } from '@manpro/shared';
import { inArray } from 'drizzle-orm';
import type { Db } from './index.js';
import {
  activationTypes,
  componentCategories,
  couriers,
  customFieldDefinitions,
  productTypeActivationTypes,
  productTypeComponentCategories,
  productTypes,
  productTypeStages,
  qcTemplateItems,
  qcTemplates,
  software,
} from './schema.js';

const COMPONENT_CATEGORIES = [
  'Motherboard',
  'Processor (CPU)',
  'RAM',
  'SSD',
  'HDD',
  'PSU',
  'Casing',
  'GPU / VGA',
  'RAID Card',
  'NIC / Network Card',
  'Modul OPS',
  'Monitor',
  'Keyboard & Mouse',
  'Stand / Bracket',
  'Remote',
  'Stylus',
  'Charger / Adaptor',
  'Baterai',
];

const ACTIVATION_TYPES = [
  { name: 'Windows 11 Pro OEM', kind: 'os' },
  { name: 'Windows 11 Pro Retail', kind: 'os' },
  { name: 'Windows 11 Pro Volume', kind: 'os' },
  { name: 'Windows Server 2025 Standard', kind: 'os' },
  { name: 'Windows Server CAL', kind: 'other' },
  { name: 'Microsoft Office', kind: 'software' },
  { name: 'Antivirus', kind: 'software' },
] as const;

const SOFTWARE = [
  { name: 'Microsoft Office LTSC 2024', publisher: 'Microsoft' },
  { name: 'Microsoft 365 Apps', publisher: 'Microsoft' },
  { name: 'ESET Endpoint Security', publisher: 'ESET' },
  { name: 'Adobe Acrobat Reader', publisher: 'Adobe' },
];

const COURIERS = ['JNE', 'J&T Express', 'SiCepat', 'TIKI', 'Pos Indonesia', 'Deliveree', 'Lalamove', 'Kurir Internal'];

type R = StageRequirement;
interface ProductTypeSeed {
  code: string;
  name: string;
  /** Urutan: assembling, activation, qc, packing, shipping, installation */
  stages: [R, R, R, R, R, R];
  components: string[];
  activations: string[];
  customFields?: CustomFieldInput[];
  qc: [string, QcItemType?, boolean?][];
}

const WIN_CLIENT = ['Windows 11 Pro OEM', 'Windows 11 Pro Retail', 'Windows 11 Pro Volume', 'Microsoft Office', 'Antivirus'];

const PRODUCT_TYPES: ProductTypeSeed[] = [
  {
    code: 'LAPTOP',
    name: 'Laptop',
    stages: ['optional', 'required', 'required', 'required', 'required', 'skipped'],
    components: ['RAM', 'SSD', 'Charger / Adaptor', 'Baterai'],
    activations: WIN_CLIENT,
    customFields: [{ key: 'charger_sn', label: 'SN Charger', inputType: 'serial', options: null, isRequired: false, isSecret: false }],
    qc: [
      ['Menyala & masuk sistem operasi'],
      ['Baterai & charging'],
      ['Keyboard'],
      ['Touchpad'],
      ['Webcam'],
      ['Layar (tidak ada dead pixel)'],
      ['WiFi & Bluetooth'],
      ['Port USB / HDMI / Audio'],
      ['Catatan tambahan', 'text', false],
    ],
  },
  {
    code: 'AIO',
    name: 'AIO (All-in-One)',
    stages: ['optional', 'required', 'required', 'required', 'required', 'skipped'],
    components: ['RAM', 'SSD', 'Keyboard & Mouse'],
    activations: WIN_CLIENT,
    qc: [
      ['Menyala & masuk sistem operasi'],
      ['Layar (tidak ada dead pixel)'],
      ['Webcam'],
      ['Speaker'],
      ['WiFi & Bluetooth'],
      ['Semua port'],
      ['Keyboard & mouse'],
      ['Catatan tambahan', 'text', false],
    ],
  },
  {
    code: 'DESKTOP',
    name: 'Desktop PC',
    stages: ['required', 'required', 'required', 'required', 'required', 'skipped'],
    components: ['Motherboard', 'Processor (CPU)', 'RAM', 'SSD', 'HDD', 'PSU', 'Casing', 'GPU / VGA', 'Monitor', 'Keyboard & Mouse'],
    activations: WIN_CLIENT,
    qc: [
      ['POST & masuk sistem operasi'],
      ['Stress test'],
      ['Suhu CPU maksimal saat stress test (°C)', 'number'],
      ['Semua port'],
      ['Monitor'],
      ['Keyboard & mouse'],
      ['Catatan tambahan', 'text', false],
    ],
  },
  {
    code: 'MINIPC',
    name: 'Mini PC',
    stages: ['optional', 'required', 'required', 'required', 'required', 'skipped'],
    components: ['RAM', 'SSD', 'Charger / Adaptor'],
    activations: WIN_CLIENT,
    qc: [
      ['Menyala & masuk sistem operasi'],
      ['Semua port'],
      ['WiFi & Bluetooth'],
      ['Suhu maksimal (°C)', 'number'],
      ['Catatan tambahan', 'text', false],
    ],
  },
  {
    code: 'SERVER',
    name: 'Server',
    stages: ['required', 'required', 'required', 'required', 'required', 'optional'],
    components: ['Motherboard', 'Processor (CPU)', 'RAM', 'SSD', 'HDD', 'PSU', 'RAID Card', 'NIC / Network Card'],
    activations: ['Windows Server 2025 Standard', 'Windows Server CAL', 'Antivirus'],
    customFields: [
      { key: 'hostname', label: 'Hostname', inputType: 'text', options: null, isRequired: false, isSecret: false },
      { key: 'ip_ipmi', label: 'IP IPMI / iDRAC / iLO', inputType: 'text', options: null, isRequired: false, isSecret: false },
      {
        key: 'raid_config',
        label: 'Konfigurasi RAID',
        inputType: 'select',
        options: ['RAID 0', 'RAID 1', 'RAID 5', 'RAID 6', 'RAID 10', 'Tanpa RAID'],
        isRequired: false,
        isSecret: false,
      },
      { key: 'ipmi_password', label: 'Password IPMI / iDRAC / iLO', inputType: 'text', options: null, isRequired: false, isSecret: true },
    ],
    qc: [
      ['POST'],
      ['Status RAID normal'],
      ['IPMI / iDRAC / iLO bisa diakses'],
      ['PSU redundan (cabut satu PSU, server tetap menyala)'],
      ['Burn-in test'],
      ['Suhu maksimal saat burn-in (°C)', 'number'],
      ['Catatan tambahan', 'text', false],
    ],
  },
  {
    code: 'WORKSTATION',
    name: 'Workstation',
    stages: ['required', 'required', 'required', 'required', 'required', 'skipped'],
    components: ['Motherboard', 'Processor (CPU)', 'RAM', 'SSD', 'HDD', 'PSU', 'Casing', 'GPU / VGA', 'Monitor', 'Keyboard & Mouse'],
    activations: WIN_CLIENT,
    qc: [
      ['POST & masuk sistem operasi'],
      ['Stress test CPU'],
      ['Stress test GPU'],
      ['Suhu CPU maksimal (°C)', 'number'],
      ['Suhu GPU maksimal (°C)', 'number'],
      ['Semua port'],
      ['Catatan tambahan', 'text', false],
    ],
  },
  {
    code: 'IFP',
    name: 'Interactive Flat Panel',
    stages: ['optional', 'optional', 'required', 'required', 'required', 'optional'],
    components: ['Modul OPS', 'Stand / Bracket', 'Remote', 'Stylus'],
    activations: ['Windows 11 Pro OEM'],
    customFields: [
      { key: 'screen_size', label: 'Ukuran layar', inputType: 'select', options: ['55"', '65"', '75"', '86"', '98"'], isRequired: false, isSecret: false },
      { key: 'firmware_version', label: 'Versi firmware / Android', inputType: 'text', options: null, isRequired: false, isSecret: false },
    ],
    qc: [
      ['Sentuhan di semua titik layar'],
      ['Tidak ada dead pixel'],
      ['Speaker'],
      ['HDMI in / out'],
      ['Modul OPS menyala (jika ada)'],
      ['Remote & stylus'],
      ['Catatan tambahan', 'text', false],
    ],
  },
  {
    code: 'AKSESORIS',
    name: 'Aksesoris / Lainnya',
    stages: ['skipped', 'skipped', 'optional', 'required', 'required', 'skipped'],
    components: [],
    activations: [],
    qc: [['Fisik & kelengkapan'], ['Catatan tambahan', 'text', false]],
  },
];

const STAGE_ORDER: Stage[] = ['assembling', 'activation', 'qc', 'packing', 'shipping', 'installation'];

async function upsertNames<T extends { name: string }>(db: Db, table: Parameters<Db['insert']>[0], rows: T[]) {
  for (const row of rows) await db.insert(table).values(row as never).onDuplicateKeyUpdate({ set: { name: row.name } as never });
}

/** Master data contoh & jenis produk standar. Aman dijalankan berkali-kali. */
export async function seedMasterData(db: Db) {
  await upsertNames(db, componentCategories, COMPONENT_CATEGORIES.map((name) => ({ name })));
  await upsertNames(db, activationTypes, [...ACTIVATION_TYPES]);
  await upsertNames(db, software, SOFTWARE);
  await upsertNames(db, couriers, COURIERS.map((name) => ({ name })));

  const compIds = new Map(
    (await db.select({ id: componentCategories.id, name: componentCategories.name }).from(componentCategories)).map((r) => [r.name, r.id]),
  );
  const actIds = new Map(
    (await db.select({ id: activationTypes.id, name: activationTypes.name }).from(activationTypes)).map((r) => [r.name, r.id]),
  );

  const existing = await db
    .select({ code: productTypes.code })
    .from(productTypes)
    .where(inArray(productTypes.code, PRODUCT_TYPES.map((p) => p.code)));
  const existingCodes = new Set(existing.map((e) => e.code));

  for (const pt of PRODUCT_TYPES) {
    // Jenis produk yang sudah ada tidak ditimpa, supaya pengaturan dari admin tidak hilang.
    if (existingCodes.has(pt.code)) continue;
    await db.transaction(async (tx) => {
      const [res] = await tx.insert(productTypes).values({ code: pt.code, name: pt.name });
      const id = res.insertId;
      await tx.insert(productTypeStages).values(STAGE_ORDER.map((stage, i) => ({ productTypeId: id, stage, requirement: pt.stages[i]! })));
      if (pt.components.length) {
        await tx
          .insert(productTypeComponentCategories)
          .values(pt.components.map((name) => ({ productTypeId: id, componentCategoryId: compIds.get(name)! })));
      }
      if (pt.activations.length) {
        await tx
          .insert(productTypeActivationTypes)
          .values(pt.activations.map((name) => ({ productTypeId: id, activationTypeId: actIds.get(name)! })));
      }
      if (pt.customFields?.length) {
        await tx.insert(customFieldDefinitions).values(pt.customFields.map((f, i) => ({ ...f, productTypeId: id, sortOrder: i })));
      }
      const [tpl] = await tx.insert(qcTemplates).values({ productTypeId: id, version: 1 });
      await tx.insert(qcTemplateItems).values(
        pt.qc.map(([label, inputType = 'pass_fail', isRequired = true], i) => ({
          qcTemplateId: tpl.insertId,
          label,
          inputType,
          isRequired,
          sortOrder: i,
        })),
      );
    });
  }
}
