import { db } from "./db";

export interface AuditEntry {
  userId?: string | null;
  clientId?: string | null;
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
        clientId: entry.clientId || null,
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

/**
 * Log an audit entry with request context (IP + user-agent).
 */
export async function logAuditFromRequest(
  req: Request,
  entry: Omit<AuditEntry, "ipAddress" | "userAgent"> & {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  const ip = entry.ipAddress || getClientIP(req);
  const ua = entry.userAgent || req.headers.get("user-agent") || null;
  await logAudit({ ...entry, ipAddress: ip, userAgent: ua });
}

/**
 * Extract client IP from request headers.
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/**
 * Summarize a user-agent string into a short safe label.
 * Returns "unknown", "mobile", "desktop", or a trimmed string.
 */
export function summarizeUserAgent(
  ua: string | null | undefined
): string {
  if (!ua || typeof ua !== "string" || ua.trim().length === 0) return "unknown";
  const lower = ua.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|opera mini|windows phone/i.test(lower)) {
    return "mobile";
  }
  if (/windows nt|macintosh|linux x86|cros/i.test(lower)) {
    return "desktop";
  }
  // Fallback: return first 50 chars (no sensitive data in user-agent)
  return ua.slice(0, 50);
}

/**
 * Mask a phone number for logging (show only last 4 digits).
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length < 4) return "****";
  return "****" + cleaned.slice(-4);
}

/**
 * Query audit logs with optional filters.
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = { contains: filters.action };
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;

  return db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit || 100,
    skip: filters.offset || 0,
  });
}

/**
 * Get a single audit log by ID.
 */
export async function getAuditLogById(id: string) {
  return db.auditLog.findUnique({ where: { id } });
}

/**
 * Query payment-related audit logs.
 */
export async function queryPaymentAuditLogs(filters: {
  userId?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {
    OR: [
      { action: { contains: "payment" } },
      { action: { contains: "payphone" } },
      { action: { contains: "transaction" } },
    ],
  };
  if (filters.userId) where.userId = filters.userId;

  return db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit || 100,
    skip: filters.offset || 0,
  });
}
