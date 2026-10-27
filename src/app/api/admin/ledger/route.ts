import type { LedgerType } from "@prisma/client";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

const TYPES = new Set(["EARN", "REDEEM", "REFUND_REVERSAL", "MANUAL_ADJUST", "CORRECTION", "SIGNUP_BONUS", "BIRTHDAY_BONUS", "REFERRAL_BONUS", "EXPIRY"]);

export const GET = route({ name: "admin", role: "MANAGER" }, async ({ req, actor }) => {
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type");
  const staffId = sp.get("staffId");
  const before = sp.get("before");
  return prisma.ledgerEntry.findMany({
    where: {
      businessId: actor.businessId,
      ...(type && TYPES.has(type) ? { type: type as LedgerType } : {}),
      ...(staffId ? { staffId } : {}),
      ...(before && !Number.isNaN(Date.parse(before)) ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      staff: { select: { username: true, name: true } },
      customer: { select: { name: true } },
      order: { select: { externalRef: true } },
    },
  });
});
