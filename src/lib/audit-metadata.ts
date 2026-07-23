export type AuditLogLike = {
  entity_type?: unknown;
  entity_id?: unknown;
  metadata?: unknown;
};

export function readAuditMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function getAuditClientId(entry: AuditLogLike): string | null {
  const metadata = readAuditMetadata(entry.metadata);
  if (typeof metadata.client_id === "string" && metadata.client_id.trim()) {
    return metadata.client_id.trim();
  }

  if (
    entry.entity_type === "client_account" &&
    typeof entry.entity_id === "string" &&
    entry.entity_id.trim()
  ) {
    return entry.entity_id.trim();
  }

  return null;
}

export function withAuditClientId(
  clientId: string,
  metadata: Record<string, unknown>
): Record<string, unknown> {
  return { ...metadata, client_id: clientId };
}
