import {
  STAGES,
  type Actor,
  type CustomFieldInput,
  type ProductTypeDetailDto,
  type ProductTypeSummaryDto,
  type QcTemplateInput,
  type Stage,
  type StageRequirement,
  type UpdateProductTypeInput,
} from '@manpro/shared';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/index.js';
import {
  activationTypes,
  componentCategories,
  customFieldDefinitions,
  productTypeActivationTypes,
  productTypeComponentCategories,
  products,
  productTypes,
  productTypeStages,
  qcTemplateItems,
  qcTemplates,
} from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, conflict, isDuplicateKeyError, notFound } from '../lib/errors.js';

/** Tahapan default untuk jenis produk baru: semua wajib, kecuali Instalasi opsional. */
export function defaultStages(): { stage: Stage; requirement: StageRequirement }[] {
  return STAGES.map((stage) => ({ stage, requirement: stage === 'installation' ? 'optional' : 'required' }));
}

function sortStages<T extends { stage: Stage }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
}

export async function listProductTypes(db: Db, includeInactive: boolean): Promise<ProductTypeSummaryDto[]> {
  const types = await db
    .select()
    .from(productTypes)
    .where(includeInactive ? undefined : eq(productTypes.isActive, true))
    .orderBy(asc(productTypes.name));
  if (types.length === 0) return [];
  const ids = types.map((t) => t.id);

  const [stageRows, countRows] = await Promise.all([
    db.select().from(productTypeStages).where(inArray(productTypeStages.productTypeId, ids)),
    db
      .select({ productTypeId: products.productTypeId, n: count() })
      .from(products)
      .where(inArray(products.productTypeId, ids))
      .groupBy(products.productTypeId),
  ]);

  return types.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    isActive: t.isActive,
    stages: sortStages(stageRows.filter((s) => s.productTypeId === t.id)).map(({ stage, requirement }) => ({ stage, requirement })),
    productCount: countRows.find((c) => c.productTypeId === t.id)?.n ?? 0,
  }));
}

export async function getProductType(db: Db, id: number): Promise<ProductTypeDetailDto> {
  const [type] = await db.select().from(productTypes).where(eq(productTypes.id, id));
  if (!type) throw notFound('Jenis produk tidak ditemukan');

  const [stageRows, compRows, actRows, fieldRows, [template], [productCount]] = await Promise.all([
    db.select().from(productTypeStages).where(eq(productTypeStages.productTypeId, id)),
    db.select().from(productTypeComponentCategories).where(eq(productTypeComponentCategories.productTypeId, id)),
    db.select().from(productTypeActivationTypes).where(eq(productTypeActivationTypes.productTypeId, id)),
    db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.productTypeId, id))
      .orderBy(asc(customFieldDefinitions.sortOrder)),
    db
      .select()
      .from(qcTemplates)
      .where(and(eq(qcTemplates.productTypeId, id), eq(qcTemplates.isActive, true)))
      .orderBy(desc(qcTemplates.version))
      .limit(1),
    db.select({ n: count() }).from(products).where(eq(products.productTypeId, id)),
  ]);

  const items = template
    ? await db
        .select()
        .from(qcTemplateItems)
        .where(eq(qcTemplateItems.qcTemplateId, template.id))
        .orderBy(asc(qcTemplateItems.sortOrder))
    : [];

  return {
    id: type.id,
    code: type.code,
    name: type.name,
    isActive: type.isActive,
    productCount: productCount?.n ?? 0,
    stages: sortStages(stageRows).map(({ stage, requirement }) => ({ stage, requirement })),
    componentCategoryIds: compRows.map((r) => r.componentCategoryId),
    activationTypeIds: actRows.map((r) => r.activationTypeId),
    customFields: fieldRows.map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      inputType: f.inputType,
      options: f.options ?? null,
      isRequired: f.isRequired,
      isSecret: f.isSecret,
    })),
    qcTemplate: template
      ? {
          id: template.id,
          version: template.version,
          items: items.map((i) => ({ id: i.id, label: i.label, inputType: i.inputType, isRequired: i.isRequired })),
        }
      : null,
  };
}

function duplicate(error: unknown): never {
  if (isDuplicateKeyError(error)) throw conflict('Kode atau nama jenis produk sudah dipakai');
  throw error;
}

export async function createProductType(db: Db, actor: Actor, input: { code: string; name: string }, ip: string | null) {
  const id = await db
    .transaction(async (tx) => {
      const [res] = await tx.insert(productTypes).values(input);
      const id = res.insertId;
      await tx.insert(productTypeStages).values(defaultStages().map((s) => ({ ...s, productTypeId: id })));
      await logActivity(tx, { userId: actor.id, action: 'create', entityType: 'product_type', entityId: id, newValues: input, ipAddress: ip });
      return id;
    })
    .catch(duplicate);
  return getProductType(db, id);
}

async function ensureIdsExist(db: DbOrTx, table: typeof componentCategories | typeof activationTypes, ids: number[], label: string) {
  if (ids.length === 0) return;
  const rows = await db.select({ id: table.id }).from(table).where(inArray(table.id, ids));
  if (rows.length !== new Set(ids).size) throw badRequest(`${label} tidak ditemukan`);
}

export async function updateProductType(db: Db, actor: Actor, id: number, input: UpdateProductTypeInput, ip: string | null) {
  const before = await getProductType(db, id);
  const componentCategoryIds = [...new Set(input.componentCategoryIds)];
  const activationTypeIds = [...new Set(input.activationTypeIds)];
  await ensureIdsExist(db, componentCategories, componentCategoryIds, 'Kategori komponen');
  await ensureIdsExist(db, activationTypes, activationTypeIds, 'Jenis aktivasi');

  await db
    .transaction(async (tx) => {
      await tx.update(productTypes).set({ code: input.code, name: input.name }).where(eq(productTypes.id, id));

      await tx.delete(productTypeStages).where(eq(productTypeStages.productTypeId, id));
      await tx.insert(productTypeStages).values(input.stages.map((s) => ({ ...s, productTypeId: id })));

      await tx.delete(productTypeComponentCategories).where(eq(productTypeComponentCategories.productTypeId, id));
      if (componentCategoryIds.length) {
        await tx
          .insert(productTypeComponentCategories)
          .values(componentCategoryIds.map((componentCategoryId) => ({ productTypeId: id, componentCategoryId })));
      }

      await tx.delete(productTypeActivationTypes).where(eq(productTypeActivationTypes.productTypeId, id));
      if (activationTypeIds.length) {
        await tx
          .insert(productTypeActivationTypes)
          .values(activationTypeIds.map((activationTypeId) => ({ productTypeId: id, activationTypeId })));
      }

      await logActivity(tx, {
        userId: actor.id,
        action: 'update',
        entityType: 'product_type',
        entityId: id,
        oldValues: {
          code: before.code,
          name: before.name,
          stages: before.stages,
          componentCategoryIds: before.componentCategoryIds,
          activationTypeIds: before.activationTypeIds,
        },
        newValues: { ...input, componentCategoryIds, activationTypeIds },
        ipAddress: ip,
      });
    })
    .catch(duplicate);
  return getProductType(db, id);
}

/**
 * Ganti seluruh daftar kolom tambahan.
 * Nilai kolom disimpan di unit berdasarkan `key`, jadi kunci yang sama tetap membaca data lama.
 */
export async function replaceCustomFields(db: Db, actor: Actor, id: number, fields: CustomFieldInput[], ip: string | null) {
  const before = await getProductType(db, id);
  await db.transaction(async (tx) => {
    await tx.delete(customFieldDefinitions).where(eq(customFieldDefinitions.productTypeId, id));
    if (fields.length) {
      await tx.insert(customFieldDefinitions).values(
        fields.map((f, i) => ({
          ...f,
          options: f.inputType === 'select' ? f.options : null,
          productTypeId: id,
          sortOrder: i,
        })),
      );
    }
    await logActivity(tx, {
      userId: actor.id,
      action: 'update_custom_fields',
      entityType: 'product_type',
      entityId: id,
      oldValues: before.customFields,
      newValues: fields,
      ipAddress: ip,
    });
  });
  return getProductType(db, id);
}

/** Simpan template QC sebagai versi baru; versi lama dinonaktifkan tapi tidak dihapus. */
export async function saveQcTemplate(db: Db, actor: Actor, id: number, input: QcTemplateInput, ip: string | null) {
  await getProductType(db, id);
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ version: qcTemplates.version })
      .from(qcTemplates)
      .where(eq(qcTemplates.productTypeId, id))
      .orderBy(desc(qcTemplates.version))
      .limit(1)
      .for('update');
    const version = (last?.version ?? 0) + 1;

    await tx.update(qcTemplates).set({ isActive: false }).where(eq(qcTemplates.productTypeId, id));
    const [res] = await tx.insert(qcTemplates).values({ productTypeId: id, version, createdBy: actor.id });
    await tx
      .insert(qcTemplateItems)
      .values(input.items.map((item, i) => ({ ...item, qcTemplateId: res.insertId, sortOrder: i })));
    await logActivity(tx, {
      userId: actor.id,
      action: 'save_qc_template',
      entityType: 'product_type',
      entityId: id,
      newValues: { version, items: input.items },
      ipAddress: ip,
    });
  });
  return getProductType(db, id);
}

export async function setProductTypeActive(db: Db, actor: Actor, id: number, isActive: boolean, ip: string | null) {
  await getProductType(db, id);
  await db.transaction(async (tx) => {
    await tx.update(productTypes).set({ isActive }).where(eq(productTypes.id, id));
    await logActivity(tx, {
      userId: actor.id,
      action: isActive ? 'activate' : 'deactivate',
      entityType: 'product_type',
      entityId: id,
      newValues: { isActive },
      ipAddress: ip,
    });
  });
  return getProductType(db, id);
}
