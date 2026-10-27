import type { AlertType, Prisma, Settings } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { addHours } from "@/lib/time";
import { isOffHours } from "./rules";

/** ينشئ تنبيه تلاعب للأدمن (بدون تكرار نفس التنبيه غير المقروء خلال ساعة) */
export async function raiseAlert(
  db: Db,
  input: { businessId: string; type: AlertType; staffId?: string | null; customerId?: string | null; details: object },
  now = new Date(),
): Promise<void> {
  const dup = await db.fraudAlert.findFirst({
    where: {
      businessId: input.businessId,
      type: input.type,
      staffId: input.staffId ?? null,
      customerId: input.customerId ?? null,
      acknowledgedAt: null,
      createdAt: { gte: addHours(now, -1) },
    },
    select: { id: true },
  });
  if (dup) return;
  await db.fraudAlert.create({
    data: {
      businessId: input.businessId,
      type: input.type,
      staffId: input.staffId ?? null,
      customerId: input.customerId ?? null,
      details: input.details as Prisma.InputJsonValue,
      createdAt: now,
    },
  });
}

export async function checkAfterEarn(
  db: Db,
  p: { businessId: string; staffId: string; customerId: string; settings: Settings; tz: string; now: Date },
): Promise<void> {
  const { settings: s, now } = p;
  const since = addHours(now, -s.alertSameCustomerWindowHours);
  const count = await db.ledgerEntry.count({
    where: {
      customerId: p.customerId,
      staffId: p.staffId,
      type: { in: ["EARN", "MANUAL_ADJUST"] },
      points: { gt: 0 },
      createdAt: { gte: since },
    },
  });
  if (count >= s.alertSameCustomerCount) {
    await raiseAlert(db, {
      businessId: p.businessId,
      type: "FREQUENT_SAME_CUSTOMER",
      staffId: p.staffId,
      customerId: p.customerId,
      details: { count, windowHours: s.alertSameCustomerWindowHours },
    }, now);
  }
  await checkOffHours(db, p, "EARN");
}

export async function checkOffHours(
  db: Db,
  p: { businessId: string; staffId: string; customerId: string; settings: Settings; tz: string; now: Date },
  operation: string,
): Promise<void> {
  if (isOffHours(p.settings, p.now, p.tz)) {
    await raiseAlert(db, {
      businessId: p.businessId,
      type: "OFF_HOURS",
      staffId: p.staffId,
      customerId: p.customerId,
      details: { operation, at: p.now.toISOString() },
    }, p.now);
  }
}

export async function checkAfterRedeem(
  db: Db,
  p: { businessId: string; staffId: string; customerId: string; settings: Settings; tz: string; now: Date },
): Promise<void> {
  const { settings: s, now } = p;
  const customerCount = await db.redemption.count({
    where: { customerId: p.customerId, createdAt: { gte: addHours(now, -s.alertRedemptionsWindowHours) } },
  });
  if (customerCount >= s.alertRedemptionsCount) {
    await raiseAlert(db, {
      businessId: p.businessId,
      type: "CONSECUTIVE_REDEMPTIONS",
      staffId: p.staffId,
      customerId: p.customerId,
      details: { scope: "customer", count: customerCount, windowHours: s.alertRedemptionsWindowHours },
    }, now);
  }
  // آخر عمليات الموظف كلها استبدالات متتالية
  const n = Math.max(2, s.alertRedemptionsCount + 1);
  const recent = await db.ledgerEntry.findMany({
    where: { staffId: p.staffId, type: { in: ["EARN", "REDEEM"] } },
    orderBy: { createdAt: "desc" },
    take: n,
    select: { type: true },
  });
  if (recent.length === n && recent.every((r) => r.type === "REDEEM")) {
    await raiseAlert(db, {
      businessId: p.businessId,
      type: "CONSECUTIVE_REDEMPTIONS",
      staffId: p.staffId,
      customerId: null,
      details: { scope: "staff", consecutive: n },
    }, now);
  }
  await checkOffHours(db, p, "REDEEM");
}

export async function listOpenAlerts(businessId: string, db: Db = prisma) {
  return db.fraudAlert.findMany({
    where: { businessId, acknowledgedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
