import { prisma } from "./db";
import { AppError } from "./errors";

/**
 * Rate limit بنافذة ثابتة مخزّنة في Postgres (تعمل مع أكثر من نسخة من الخدمة).
 * يعيد عدد الطلبات في النافذة الحالية.
 */
export async function hit(key: string, windowSec: number, now = new Date()): Promise<number> {
  const windowIndex = Math.floor(now.getTime() / 1000 / windowSec);
  const bucketKey = `${key}:${windowIndex}`;
  const expiresAt = new Date((windowIndex + 1) * windowSec * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt") VALUES (${bucketKey}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  return Number(rows[0]?.count ?? 1);
}

export async function enforceRateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const count = await hit(key, windowSec);
  if (count > limit) {
    throw new AppError("RATE_LIMITED", "طلبات كثيرة، حاول بعد قليل", { retryAfter: windowSec });
  }
}

export async function purgeExpiredBuckets(now = new Date()): Promise<number> {
  const res = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
  return res.count;
}
