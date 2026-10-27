import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { purgeExpiredBuckets } from "@/lib/ratelimit";
import { addHours } from "@/lib/time";
import { runBirthdayBonuses } from "./bonuses";
import { getDefaultBusiness } from "./business";
import { runExpiry } from "./expiry";
import { enqueueForPasses, processDueJobs } from "./wallet/sync";

/** يجدد QR البطاقات قبل انتهاء صلاحيته (التوكن قصير العمر) */
export async function rotateQrCodes(businessId: string, now = new Date()): Promise<number> {
  const threshold = addHours(now, -env.qrPassTtlHours / 2);
  const passes = await prisma.walletPass.findMany({
    where: {
      businessId,
      qrIssuedAt: { not: null, lt: threshold },
      OR: [{ platform: "GOOGLE" }, { platform: "APPLE", devices: { some: {} } }],
    },
    select: { id: true, businessId: true },
    take: 500,
  });
  return enqueueForPasses(prisma, passes, "PASS_UPDATE", null, now);
}

/** مهمة cron (كل 5 دقائق على Railway): الطابور + تجديد QR + الصلاحية + أعياد الميلاد */
export async function runCron(now = new Date()) {
  const business = await getDefaultBusiness();
  const rotated = await rotateQrCodes(business.id, now);
  const expiry = await runExpiry(business.id, now);
  const birthdays = await runBirthdayBonuses(business.id, now);
  const sync = await processDueJobs(200, now);
  const purged = await purgeExpiredBuckets(now);
  return { rotated, expiry, birthdays, sync, purged };
}
