import type { DbOrTx } from '../db/index.js';
import { activityLogs } from '../db/schema.js';

export interface AuditEntry {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | number;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
}

/** Field yang tidak boleh ikut tercatat di audit trail. */
const SECRET_KEYS = new Set(['password']);

function scrub(values: unknown): unknown {
  if (values === undefined || values === null || typeof values !== 'object') return values ?? null;
  return Object.fromEntries(Object.entries(values).filter(([k]) => !SECRET_KEYS.has(k)));
}

export async function logActivity(db: DbOrTx, entry: AuditEntry) {
  await db.insert(activityLogs).values({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: String(entry.entityId),
    oldValues: scrub(entry.oldValues),
    newValues: scrub(entry.newValues),
    ipAddress: entry.ipAddress ?? null,
  });
}
