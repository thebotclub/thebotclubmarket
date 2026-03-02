import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

interface AuditLogParams {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Fire-and-forget audit log write.
 * Never throws — failures are logged but do not block responses.
 */
export function auditLog(params: AuditLogParams): void {
  db.auditLog
    .create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        metadata: params.metadata as Parameters<typeof db.auditLog.create>[0]['data']['metadata'] ?? undefined,
        ipAddress: params.ipAddress,
      },
    })
    .catch((err: Error) => {
      logger.error("auditLog write failed", { action: params.action, resource: params.resource }, err);
    });
}
