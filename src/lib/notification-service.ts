import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function notify(
  operatorId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  // Fire-and-forget: don't block the caller
  Promise.resolve().then(async () => {
    try {
      await db.notification.create({
        data: {
          userId: operatorId,
          type,
          title,
          body,
          data: (data ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      console.error("[notification-service] Error creating notification:", err);
    }
  });
}
