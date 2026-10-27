import type { Prisma, SyncKind, WalletPass, WalletSyncJob } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { addDays, nextLocalMinute } from "@/lib/time";
import { getBusiness, getSettings } from "../business";
import { isQuietHours } from "../rules";
import { pushApplePass } from "./apple";
import { syncGooglePass } from "./google";

// طابور تحديثات البطاقات (WalletSyncJob): يُعالَج فوراً بعد كل عملية،
// وما يفشل يُعاد بمحاولات تصاعدية عبر cron خدمة Railway.

export const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 6 * 3600_000;
const LEASE_MS = 5 * 60_000;

export const backoffMs = (attempts: number): number =>
  Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);

/** يعلّم بطاقات العملاء بأنها تغيّرت وينشئ مهمة تحديث (بدون تكرار مهمة معلّقة) */
export async function enqueuePassUpdates(db: Db, customerIds: string[], now = new Date()): Promise<number> {
  if (customerIds.length === 0) return 0;
  const passes = await db.walletPass.findMany({ where: { customerId: { in: [...new Set(customerIds)] } } });
  return enqueueForPasses(db, passes, "PASS_UPDATE", null, now);
}

export async function enqueueForPasses(
  db: Db,
  passes: Pick<WalletPass, "id" | "businessId">[],
  kind: SyncKind,
  payload: Prisma.InputJsonValue | null,
  now = new Date(),
): Promise<number> {
  if (passes.length === 0) return 0;
  const ids = passes.map((p) => p.id);
  await db.walletPass.updateMany({ where: { id: { in: ids } }, data: { contentUpdatedAt: now } });
  let toCreate = passes;
  if (kind === "PASS_UPDATE") {
    const pending = await db.walletSyncJob.findMany({
      where: { walletPassId: { in: ids }, status: "PENDING", kind: "PASS_UPDATE" },
      select: { walletPassId: true },
    });
    const skip = new Set(pending.map((j) => j.walletPassId));
    toCreate = passes.filter((p) => !skip.has(p.id));
    if (pending.length) {
      // المهام المعلّقة تُقدَّم لتُنفَّذ الآن
      await db.walletSyncJob.updateMany({
        where: { walletPassId: { in: [...skip] }, status: "PENDING", kind: "PASS_UPDATE", attempts: 0 },
        data: { nextRunAt: now },
      });
    }
  }
  if (toCreate.length === 0) return 0;
  const res = await db.walletSyncJob.createMany({
    data: toCreate.map((p) => ({
      businessId: p.businessId,
      walletPassId: p.id,
      kind,
      payload: payload ?? undefined,
      nextRunAt: now,
    })),
  });
  return res.count;
}

/** كل بطاقات المحل (عند تغيير الفروع أو الإعدادات أو رسالة العرض) */
export async function enqueueAllPasses(
  businessId: string,
  kind: SyncKind,
  payload: Prisma.InputJsonValue | null = null,
  now = new Date(),
  db: Db = prisma,
): Promise<number> {
  const passes = await db.walletPass.findMany({ where: { businessId }, select: { id: true, businessId: true } });
  return enqueueForPasses(db, passes, kind, payload, now);
}

/** يحجز دفعة مهام مستحقة (SKIP LOCKED يمنع معالجة نفس المهمة من نسختين) */
async function claimDue(limit: number, now: Date): Promise<WalletSyncJob[]> {
  const lease = new Date(now.getTime() + LEASE_MS);
  return prisma.$queryRaw<WalletSyncJob[]>`
    UPDATE "WalletSyncJob" SET "nextRunAt" = ${lease}, "updatedAt" = ${now}
    WHERE id IN (
      SELECT id FROM "WalletSyncJob"
      WHERE status = 'PENDING' AND "nextRunAt" <= ${now}
      ORDER BY "nextRunAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

type Outcome = { kind: "done" } | { kind: "defer"; until: Date };

async function runJob(job: WalletSyncJob, now: Date): Promise<Outcome> {
  const pass = await prisma.walletPass.findUnique({ where: { id: job.walletPassId }, include: { customer: true } });
  if (!pass) return { kind: "done" };

  let notifyMessage: string | null = null;
  if (job.kind === "OFFER" || job.kind === "NOTICE") {
    const [settings, business] = await Promise.all([getSettings(pass.businessId), getBusiness(pass.businessId)]);
    if (isQuietHours(settings, now, business.timezone)) {
      return { kind: "defer", until: nextLocalMinute(now, settings.quietEndMinute, business.timezone) };
    }
    const text = String((job.payload as { text?: string } | null)?.text ?? "");
    if (job.kind === "OFFER") {
      const recent = await prisma.promoDelivery.count({
        where: { customerId: pass.customerId, createdAt: { gte: addDays(now, -7) } },
      });
      const allowed = !pass.customer.promoOptOut && recent < settings.promoWeeklyCap && text.length > 0;
      await prisma.walletPass.update({
        where: { id: pass.id },
        data: { offerText: text, offerNotify: allowed, contentUpdatedAt: now },
      });
      if (allowed) {
        await prisma.promoDelivery.create({
          data: { businessId: pass.businessId, customerId: pass.customerId, walletPassId: pass.id, message: text },
        });
        notifyMessage = text;
      }
    } else {
      await prisma.walletPass.update({ where: { id: pass.id }, data: { noticeText: text, contentUpdatedAt: now } });
      notifyMessage = text || null;
    }
  }

  const fresh = await prisma.walletPass.findUniqueOrThrow({ where: { id: pass.id } });
  if (fresh.platform === "APPLE") await pushApplePass(fresh);
  else await syncGooglePass(fresh, { message: notifyMessage });
  return { kind: "done" };
}

export interface SyncReport {
  processed: number;
  done: number;
  failed: number;
  dead: number;
  deferred: number;
}

export async function processDueJobs(limit = 50, now = new Date()): Promise<SyncReport> {
  const report: SyncReport = { processed: 0, done: 0, failed: 0, dead: 0, deferred: 0 };
  const jobs = await claimDue(limit, now);
  for (const job of jobs) {
    report.processed++;
    try {
      const outcome = await runJob(job, now);
      if (outcome.kind === "defer") {
        report.deferred++;
        await prisma.walletSyncJob.update({ where: { id: job.id }, data: { nextRunAt: outcome.until } });
      } else {
        report.done++;
        await prisma.walletSyncJob.update({ where: { id: job.id }, data: { status: "DONE", lastError: null } });
      }
    } catch (e) {
      const attempts = job.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      if (dead) report.dead++;
      else report.failed++;
      await prisma.walletSyncJob.update({
        where: { id: job.id },
        data: {
          attempts,
          status: dead ? "DEAD" : "PENDING",
          nextRunAt: new Date(now.getTime() + backoffMs(attempts)),
          lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        },
      });
    }
  }
  return report;
}

let running: Promise<unknown> | null = null;

/** تشغيل فوري في الخلفية بعد العمليات (لا ينتظر الطلب) */
export function kickSync(): void {
  if (process.env.WALLET_SYNC_INLINE === "off") return;
  if (running) return;
  running = processDueJobs(25)
    .catch((e) => console.error("[wallet-sync] inline run failed", e))
    .finally(() => {
      running = null;
    });
}
