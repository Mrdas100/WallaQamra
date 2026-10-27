import { prisma } from "@/lib/db";
import { addDays, zonedParts } from "@/lib/time";
import { getBusiness } from "./business";

export interface Report {
  from: string;
  to: string;
  totalCustomers: number;
  newCustomers: number;
  activeCustomers: number;
  returningCustomers: number;
  returnRatePct: number;
  orders: number;
  revenueSar: number;
  pointsGranted: number;
  pointsRedeemed: number;
  pointsExpired: number;
  redemptions: number;
  byHour: { hour: number; orders: number }[];
}

/** تقارير الأدمن لفترة (افتراضياً آخر 30 يوماً) */
export async function buildReport(businessId: string, days = 30, now = new Date()): Promise<Report> {
  const business = await getBusiness(businessId);
  const from = addDays(now, -days);
  const range = { gte: from, lte: now };
  const [totalCustomers, newCustomers, orders, sums, redemptions] = await Promise.all([
    prisma.customer.count({ where: { businessId } }),
    prisma.customer.count({ where: { businessId, createdAt: range } }),
    prisma.order.findMany({
      where: { businessId, status: "COMPLETED", createdAt: range },
      select: { customerId: true, amountHalalas: true, createdAt: true },
    }),
    prisma.ledgerEntry.groupBy({
      by: ["type"],
      where: { businessId, createdAt: range },
      _sum: { points: true },
    }),
    prisma.redemption.count({ where: { businessId, createdAt: range } }),
  ]);

  const visits = new Map<string, number>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  let revenue = 0;
  for (const o of orders) {
    visits.set(o.customerId, (visits.get(o.customerId) ?? 0) + 1);
    hours[zonedParts(o.createdAt, business.timezone).hour].orders++;
    revenue += o.amountHalalas;
  }
  const active = visits.size;
  const returning = [...visits.values()].filter((v) => v >= 2).length;
  const sum = (types: string[]) =>
    sums.filter((s) => types.includes(s.type)).reduce((acc, s) => acc + (s._sum.points ?? 0), 0);

  return {
    from: from.toISOString(),
    to: now.toISOString(),
    totalCustomers,
    newCustomers,
    activeCustomers: active,
    returningCustomers: returning,
    returnRatePct: active ? Math.round((returning / active) * 1000) / 10 : 0,
    orders: orders.length,
    revenueSar: Math.round(revenue) / 100,
    pointsGranted: sum(["EARN", "SIGNUP_BONUS", "BIRTHDAY_BONUS", "REFERRAL_BONUS"]),
    pointsRedeemed: -sum(["REDEEM"]),
    pointsExpired: -sum(["EXPIRY"]),
    redemptions,
    byHour: hours,
  };
}
