import { prisma, lockCustomer, lockKey } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { addHours } from "@/lib/time";
import { hasRole, type Actor } from "./actor";
import { checkAfterEarn, raiseAlert } from "./alerts";
import { getBusiness, getSettings } from "./business";
import { appendEntry, getBalance, reverseEntry } from "./ledger";
import { IDEMPOTENCY_RE } from "./orders";
import { unitForMode } from "./rules";
import { enqueuePassUpdates, kickSync } from "./wallet/sync";

const MAX_MANUAL = 10_000;

function requireReason(reason: string | undefined | null): string {
  const r = (reason ?? "").trim();
  if (r.length < 5) throw new AppError("BAD_REQUEST", "السبب إجباري (5 أحرف على الأقل)");
  return r.slice(0, 300);
}

/** إضافة/خصم يدوي بدون طلب: صلاحية مدير + سبب إجباري + حد لكل موظف في الوردية */
export async function manualAdjust(
  actor: Actor,
  input: { customerId: string; points: number; reason: string; idempotencyKey: string },
  now = new Date(),
) {
  if (!hasRole(actor.role, "MANAGER")) throw new AppError("FORBIDDEN", "هذه العملية تحتاج صلاحية مدير");
  const reason = requireReason(input.reason);
  if (!Number.isInteger(input.points) || input.points === 0 || Math.abs(input.points) > MAX_MANUAL) {
    throw new AppError("BAD_REQUEST", "عدد النقاط غير صالح");
  }
  if (!IDEMPOTENCY_RE.test(input.idempotencyKey)) throw new AppError("BAD_REQUEST", "مفتاح العملية غير صالح");
  const [settings, business] = await Promise.all([getSettings(actor.businessId), getBusiness(actor.businessId)]);
  const unit = unitForMode(settings.programMode);

  const result = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `manual-staff:${actor.staffId}`);
    await lockCustomer(tx, input.customerId);
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "العميل غير موجود");

    const replay = await tx.ledgerEntry.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: `manual:${input.idempotencyKey}` } },
    });
    if (replay) return { entry: replay, replayed: true };

    if (actor.role !== "ADMIN" && input.points > 0) {
      const since = addHours(now, -settings.shiftHours);
      const shift = await tx.ledgerEntry.aggregate({
        where: { staffId: actor.staffId, type: "MANUAL_ADJUST", points: { gt: 0 }, createdAt: { gte: since } },
        _count: true,
        _sum: { points: true },
      });
      const count = shift._count;
      const sum = shift._sum.points ?? 0;
      if (count + 1 > settings.manualMaxPerShift || sum + input.points > settings.manualMaxPointsPerShift) {
        return { limit: { count, sum } };
      }
    }
    const { entry } = await appendEntry(tx, {
      businessId: actor.businessId,
      customerId: customer.id,
      type: "MANUAL_ADJUST",
      unit,
      points: input.points,
      idempotencyKey: `manual:${input.idempotencyKey}`,
      actor,
      reason,
      expiryDays: settings.pointsExpiryDays,
      now,
    });
    if (input.points > 0) {
      await checkAfterEarn(tx, {
        businessId: actor.businessId,
        staffId: actor.staffId,
        customerId: customer.id,
        settings,
        tz: business.timezone,
        now,
      });
    }
    await enqueuePassUpdates(tx, [customer.id], now);
    return { entry, replayed: false };
  });

  if ("limit" in result && result.limit) {
    await raiseAlert(prisma, {
      businessId: actor.businessId,
      type: "MANUAL_LIMIT_REACHED",
      staffId: actor.staffId,
      customerId: input.customerId,
      details: { ...result.limit, requested: input.points, shiftHours: settings.shiftHours },
    }, now);
    throw new AppError("SHIFT_LIMIT", "تم بلوغ حد الإضافات اليدوية لهذه الوردية");
  }
  kickSync();
  return { entry: result.entry!, replayed: result.replayed!, balance: await getBalance(input.customerId, unit) };
}

/** تصحيح حركة خاطئة بحركة عكسية مع سبب (لا تعديل ولا حذف) */
export async function correctEntry(actor: Actor, input: { entryId: string; reason: string }, now = new Date()) {
  if (!hasRole(actor.role, "MANAGER")) throw new AppError("FORBIDDEN", "هذه العملية تحتاج صلاحية مدير");
  const reason = requireReason(input.reason);
  const settings = await getSettings(actor.businessId);
  const reversal = await prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.findUnique({ where: { id: input.entryId } });
    if (!entry || entry.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "الحركة غير موجودة");
    await lockCustomer(tx, entry.customerId);
    const r = await reverseEntry(tx, {
      entry,
      type: "CORRECTION",
      reason,
      actor,
      expiryDays: settings.pointsExpiryDays,
      now,
    });
    await enqueuePassUpdates(tx, [entry.customerId], now);
    return r;
  });
  kickSync();
  return reversal;
}
