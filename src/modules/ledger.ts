import type { LedgerEntry, LedgerType, Prisma, Unit } from "@prisma/client";
import { prisma, type Db, type Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { addDays } from "@/lib/time";
import type { Actor } from "./actor";

// الرصيد = مجموع الحركات. لا يوجد أي حقل رصيد قابل للتعديل في النظام.

export async function getBalance(customerId: string, unit: Unit, db: Db = prisma): Promise<number> {
  const r = await db.ledgerEntry.aggregate({ where: { customerId, unit }, _sum: { points: true } });
  return r._sum.points ?? 0;
}

export interface AppendInput {
  businessId: string;
  customerId: string;
  type: LedgerType;
  unit: Unit;
  points: number;
  idempotencyKey: string;
  actor?: Actor | null;
  orderId?: string | null;
  redemptionId?: string | null;
  reversesEntryId?: string | null;
  reason?: string | null;
  /** أيام صلاحية الرصيد الموجب (0 = لا تنتهي) */
  expiryDays?: number;
  now?: Date;
}

/** إضافة حركة (idempotent): نفس المفتاح يعيد الحركة الأصلية دون إنشاء جديدة */
export async function appendEntry(tx: Tx, input: AppendInput): Promise<{ entry: LedgerEntry; created: boolean }> {
  if (!Number.isInteger(input.points) || input.points === 0) {
    throw new AppError("BAD_REQUEST", "قيمة الحركة غير صالحة");
  }
  const existing = await tx.ledgerEntry.findUnique({
    where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) return { entry: existing, created: false };

  const now = input.now ?? new Date();
  const expires =
    input.points > 0 && input.unit === "POINT" && input.expiryDays && input.expiryDays > 0
      ? addDays(now, input.expiryDays)
      : null;

  const data: Prisma.LedgerEntryUncheckedCreateInput = {
    businessId: input.businessId,
    customerId: input.customerId,
    type: input.type,
    unit: input.unit,
    points: input.points,
    idempotencyKey: input.idempotencyKey,
    orderId: input.orderId ?? null,
    redemptionId: input.redemptionId ?? null,
    reversesEntryId: input.reversesEntryId ?? null,
    reason: input.reason ?? null,
    staffId: input.actor?.staffId ?? null,
    deviceId: input.actor?.deviceId ?? null,
    ip: input.actor?.ip ?? null,
    userAgent: input.actor?.userAgent ?? null,
    expiresAt: expires,
    createdAt: now,
  };
  const entry = await tx.ledgerEntry.create({ data });
  return { entry, created: true };
}

/** حركة عكسية لحركة سابقة (التصحيح الوحيد المسموح). كل حركة تُعكس مرة واحدة فقط. */
export async function reverseEntry(
  tx: Tx,
  opts: { entry: LedgerEntry; type: LedgerType; reason: string; actor?: Actor | null; expiryDays?: number; now?: Date },
): Promise<LedgerEntry> {
  const { entry } = opts;
  if (entry.type === "EXPIRY") throw new AppError("CONFLICT", "لا يمكن عكس حركة انتهاء صلاحية");
  const already = await tx.ledgerEntry.findUnique({ where: { reversesEntryId: entry.id } });
  if (already) throw new AppError("CONFLICT", "هذه الحركة معكوسة مسبقاً");
  const { entry: reversal } = await appendEntry(tx, {
    businessId: entry.businessId,
    customerId: entry.customerId,
    type: opts.type,
    unit: entry.unit,
    points: -entry.points,
    idempotencyKey: `reverse:${entry.id}`,
    actor: opts.actor,
    orderId: entry.orderId,
    reversesEntryId: entry.id,
    reason: opts.reason,
    expiryDays: opts.expiryDays,
    now: opts.now,
  });
  return reversal;
}
