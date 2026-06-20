import { db } from "./db";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId || null,
        action: entry.action,
        entityType: entry.entityType || null,
        entityId: entry.entityId || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        metadata: JSON.stringify(entry.metadata || {}),
      },
    });
  } catch (err) {
    console.error("[audit] Failed to log:", err);
  }
}
