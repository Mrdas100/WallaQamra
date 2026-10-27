import { prisma, lockCustomer, type Db } from "@/lib/db";
import { addDays, localDateKey } from "@/lib/time";
import { getBusiness, getSettings } from "./business";
import { appendEntry, getBalance } from "./ledger";
import { enqueueForPasses, enqueuePassUpdates, kickSync } from "./wallet/sync";

/**
 * انتهاء صلاحية النقاط بطريقة FIFO دون تعديل أي حركة:
 * المنتهي المستحق = (مجموع الأرصدة الموجبة التي انتهت) − (كل الخصومات) − (ما انتهى سابقاً)
 * ويُسجَّل كحركة EXPIRY سالبة جديدة.
 */
export async function expiryState(customerId: string, at: Date, warnUntil: Date, db: Db = prisma) {
  const sum = async (where: object) =>
    (await db.ledgerEntry.aggregate({ where: { customerId, unit: "POINT", ...where }, _sum: { points: true } }))._sum
      .points ?? 0;
  const [expiredCredits, upcomingCredits, debits, alreadyExpired, balance] = await Promise.all([
    sum({ points: { gt: 0 }, expiresAt: { lte: at } }),
    sum({ points: { gt: 0 }, expiresAt: { lte: warnUntil } }),
    sum({ points: { lt: 0 }, type: { not: "EXPIRY" } }),
    sum({ type: "EXPIRY" }),
    getBalance(customerId, "POINT", db),
  ]);
  const consumed = -debits + -alreadyExpired;
  const due = Math.max(0, Math.min(expiredCredits - consumed, balance));
  const upcoming = Math.max(0, upcomingCredits - consumed - due);
  return { due, upcoming, balance };
}

export async function runExpiry(businessId: string, now = new Date()) {
  const [business, s] = await Promise.all([getBusiness(businessId), getSettings(businessId)]);
  if (s.pointsExpiryDays <= 0) return { expiredCustomers: 0, warned: 0 };
  const warnUntil = addDays(now, s.expiryWarningDays);
  const candidates = await prisma.ledgerEntry.findMany({
    where: { businessId, unit: "POINT", points: { gt: 0 }, expiresAt: { lte: warnUntil } },
    distinct: ["customerId"],
    select: { customerId: true },
  });
  const dateKey = localDateKey(now, business.timezone);
  let expiredCustomers = 0;
  let warned = 0;

  for (const { customerId } of candidates) {
    const expired = await prisma.$transaction(async (tx) => {
      await lockCustomer(tx, customerId);
      const st = await expiryState(customerId, now, warnUntil, tx);
      if (st.due > 0) {
        await appendEntry(tx, {
          businessId,
          customerId,
          type: "EXPIRY",
          unit: "POINT",
          points: -st.due,
          idempotencyKey: `expiry:${customerId}:${dateKey}`,
          reason: "انتهاء صلاحية النقاط",
          now,
        });
      }
      return st;
    });
    if (expired.due > 0) {
      expiredCustomers++;
      await enqueuePassUpdates(prisma, [customerId], now);
    }
    if (expired.upcoming > 0) {
      // تنبيه واحد لكل فترة إنذار
      const periodKey = `w${Math.floor(now.getTime() / (Math.max(1, s.expiryWarningDays) * 86_400_000))}`;
      const created = await prisma.expiryNotice
        .create({ data: { businessId, customerId, periodKey, points: expired.upcoming } })
        .then(() => true)
        .catch(() => false);
      if (created) {
        warned++;
        const passes = await prisma.walletPass.findMany({ where: { customerId }, select: { id: true, businessId: true } });
        await enqueueForPasses(
          prisma,
          passes,
          "NOTICE",
          { text: `تنتهي ${expired.upcoming} نقطة خلال ${s.expiryWarningDays} يوماً. استخدمها قبل انتهائها!` },
          now,
        );
      }
    }
  }
  if (expiredCustomers || warned) kickSync();
  return { expiredCustomers, warned };
}
