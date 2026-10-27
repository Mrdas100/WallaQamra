import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/wallet/apple", async (orig) => ({
  ...(await orig<typeof import("@/modules/wallet/apple")>()),
  pushApplePass: vi.fn(async () => {
    throw new Error("APNs down");
  }),
}));

import { prisma } from "@/lib/db";
import { ensurePass } from "@/modules/wallet/card";
import { MAX_ATTEMPTS, enqueuePassUpdates, processDueJobs } from "@/modules/wallet/sync";
import { makeBusiness, makeCustomer } from "./helpers";

describe("WalletSyncJob: إعادة المحاولة عند الفشل", () => {
  it("تتضاعف المهلة مع كل فشل ثم تتوقف بعد الحد الأقصى", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    await ensurePass(c, "APPLE");
    let now = new Date("2030-01-01T10:00:00Z");
    await enqueuePassUpdates(prisma, [c.id], now);
    const delays: number[] = [];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await processDueJobs(50, now);
      const job = await prisma.walletSyncJob.findFirstOrThrow({ where: { businessId: b.id } });
      expect(job.attempts).toBe(i + 1);
      expect(job.lastError).toContain("APNs down");
      delays.push(job.nextRunAt.getTime() - now.getTime());
      now = job.nextRunAt;
    }
    expect(delays.slice(0, 4)).toEqual([30_000, 60_000, 120_000, 240_000]);
    const job = await prisma.walletSyncJob.findFirstOrThrow({ where: { businessId: b.id } });
    expect(job.status).toBe("DEAD");
  });
});
