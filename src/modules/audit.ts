import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import type { Actor } from "./actor";

export async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
  db: Db = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      businessId: actor.businessId,
      staffId: actor.staffId,
      action,
      entity,
      entityId,
      before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      deviceId: actor.deviceId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    },
  });
}

/** يعيد فقط الحقول التي تغيّرت (لتسجيل before/after مختصر) */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const nv = after[key];
    const ov = before[key];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (JSON.stringify(norm(nv)) !== JSON.stringify(norm(ov))) {
      b[key] = norm(ov);
      a[key] = norm(nv);
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
