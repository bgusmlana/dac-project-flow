import { maskKey, UNIT_STATUS_LABELS } from '@manpro/shared';
import ExcelJS from 'exceljs';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { PassThrough } from 'node:stream';
import type { Db } from '../db/index.js';
import {
  activations,
  activationTypes,
  componentCategories,
  couriers,
  customFieldDefinitions,
  licenseKeys,
  lots,
  packages,
  projectItems,
  projects,
  qcInspections,
  shipments,
  software,
  unitAccessories,
  unitComponents,
  units,
} from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { localDateOf } from '../lib/time.js';

const CHUNK = 2000;

/**
 * Export semua unit project ke Excel (streaming, hemat memori untuk puluhan ribu baris).
 * License key selalu tersamar; kolom rahasia tidak ikut diexport.
 */
export async function exportProjectUnits(db: Db, projectId: number) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw notFound('Project tidak ditemukan');

  const items = await db.select().from(projectItems).where(eq(projectItems.projectId, projectId));
  const typeIds = [...new Set(items.map((i) => i.productTypeId))];
  const defs = typeIds.length
    ? await db
        .select()
        .from(customFieldDefinitions)
        .where(and(inArray(customFieldDefinitions.productTypeId, typeIds), eq(customFieldDefinitions.isSecret, false)))
        .orderBy(asc(customFieldDefinitions.sortOrder))
    : [];
  const fieldCols = [...new Map(defs.map((d) => [d.key, d.label])).entries()];

  const stream = new PassThrough();
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const ws = wb.addWorksheet('Unit');
  ws.columns = [
    { header: 'Serial Number', key: 'sn', width: 24 },
    { header: 'Merek', key: 'brand', width: 14 },
    { header: 'Tipe', key: 'model', width: 24 },
    { header: 'Part Number', key: 'pn', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Komponen', key: 'components', width: 50 },
    { header: 'Aktivasi', key: 'activations', width: 50 },
    { header: 'Kelengkapan', key: 'accessories', width: 30 },
    { header: 'QC terakhir', key: 'qc', width: 12 },
    { header: 'Lot', key: 'lot', width: 10 },
    { header: 'Koli', key: 'package', width: 18 },
    { header: 'Surat Jalan', key: 'shipment', width: 22 },
    { header: 'Ekspedisi', key: 'courier', width: 14 },
    { header: 'Resi', key: 'tracking', width: 18 },
    { header: 'Tgl Kirim', key: 'shippedAt', width: 12 },
    { header: 'Tgl Diterima', key: 'receivedAt', width: 12 },
    { header: 'Penerima', key: 'receivedBy', width: 18 },
    ...fieldCols.map(([key, label]) => ({ header: label, key: `f_${key}`, width: 18 })),
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).commit();

  // Isi baris di latar belakang; stream langsung dikirim ke browser.
  void (async () => {
    try {
      const itemById = new Map(items.map((i) => [i.id, i]));
      let lastId = 0;
      for (;;) {
        const rows = await db
          .select({
            id: units.id,
            sn: units.serialNumber,
            status: units.status,
            itemId: units.projectItemId,
            customFields: units.customFields,
            lot: lots.code,
            package: packages.code,
            shipment: shipments.code,
            courier: couriers.name,
            tracking: shipments.trackingNumber,
            shippedAt: shipments.shippedAt,
            receivedAt: shipments.receivedAt,
            receivedBy: shipments.receivedByName,
          })
          .from(units)
          .leftJoin(lots, eq(units.lotId, lots.id))
          .leftJoin(packages, eq(units.packageId, packages.id))
          .leftJoin(shipments, eq(packages.shipmentId, shipments.id))
          .leftJoin(couriers, eq(shipments.courierId, couriers.id))
          .where(and(eq(units.projectId, projectId), gt(units.id, lastId)))
          .orderBy(asc(units.id))
          .limit(CHUNK);
        if (rows.length === 0) break;
        lastId = rows.at(-1)!.id;
        const ids = rows.map((r) => r.id);

        const [comps, acts, accs, qcs] = await Promise.all([
          db
            .select({ unitId: unitComponents.unitId, cat: componentCategories.name, brand: unitComponents.brand, model: unitComponents.model, sn: unitComponents.serialNumber })
            .from(unitComponents)
            .innerJoin(componentCategories, eq(unitComponents.componentCategoryId, componentCategories.id))
            .where(inArray(unitComponents.unitId, ids)),
          db
            .select({
              unitId: activations.unitId,
              target: sql<string>`COALESCE(${activationTypes.name}, ${software.name})`,
              version: activations.softwareVersion,
              result: activations.result,
              last5: licenseKeys.keyLast5,
            })
            .from(activations)
            .leftJoin(activationTypes, eq(activations.activationTypeId, activationTypes.id))
            .leftJoin(software, eq(activations.softwareId, software.id))
            .leftJoin(licenseKeys, eq(activations.licenseKeyId, licenseKeys.id))
            .where(inArray(activations.unitId, ids)),
          db.select().from(unitAccessories).where(inArray(unitAccessories.unitId, ids)),
          db
            .select({ unitId: qcInspections.unitId, result: qcInspections.result, id: qcInspections.id })
            .from(qcInspections)
            .where(inArray(qcInspections.unitId, ids))
            .orderBy(asc(qcInspections.id)),
        ]);
        const group = <T extends { unitId: number }>(list: T[]) => {
          const m = new Map<number, T[]>();
          for (const x of list) m.set(x.unitId, [...(m.get(x.unitId) ?? []), x]);
          return m;
        };
        const [gc, ga, gs, gq] = [group(comps), group(acts), group(accs), group(qcs)];
        const date = (d: Date | null) => (d ? localDateOf(d) : '');

        for (const r of rows) {
          const item = itemById.get(r.itemId)!;
          const fields = Object.fromEntries(fieldCols.map(([key]) => [`f_${key}`, r.customFields[key] ?? '']));
          ws.addRow({
            sn: r.sn,
            brand: item.brand,
            model: item.model,
            pn: item.partNumber ?? '',
            status: UNIT_STATUS_LABELS[r.status],
            components: (gc.get(r.id) ?? []).map((c) => `${c.cat}: ${c.brand} ${c.model}${c.sn ? ` (${c.sn})` : ''}`).join('; '),
            activations: (ga.get(r.id) ?? [])
              .map((a) => `${a.target}${a.version ? ` ${a.version}` : ''}${a.last5 ? ` [${maskKey(a.last5)}]` : ''}${a.result === 'failed' ? ' GAGAL' : ''}`)
              .join('; '),
            accessories: (gs.get(r.id) ?? []).map((a) => `${a.name}${a.serialNumber ? ` (${a.serialNumber})` : ''}`).join('; '),
            qc: (() => {
              const last = gq.get(r.id)?.at(-1);
              return last ? (last.result === 'pass' ? 'Lulus' : 'Gagal') : '';
            })(),
            lot: r.lot ?? '',
            package: r.package ?? '',
            shipment: r.shipment ?? '',
            courier: r.courier ?? '',
            tracking: r.tracking ?? '',
            shippedAt: date(r.shippedAt),
            receivedAt: date(r.receivedAt),
            receivedBy: r.receivedBy ?? '',
            ...fields,
          }).commit();
        }
      }
      ws.commit();
      await wb.commit();
    } catch (e) {
      stream.destroy(e as Error);
    }
  })();

  return { stream, fileName: `${project.code}-unit.xlsx` };
}
