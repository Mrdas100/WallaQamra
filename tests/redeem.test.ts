import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getBalance } from "@/modules/ledger";
import { issueRedeemCode, lockMinutes, redeemReward } from "@/modules/redeem";
import { POST as redeemRoute } from "@/app/api/cashier/redeem/route";
import { POST as codeRoute } from "@/app/api/card/[id]/redeem-code/route";
import { cardKey } from "@/modules/customers";
import { apiRequest, credit, idk, json, makeBusiness, makeCustomer, makeStaff, params } from "./helpers";

async function setup(settings = {}) {
  const b = await makeBusiness({ redeemMaxAttempts: 3, redeemLockBaseMinutes: 5, ...settings });
  const c = await makeCustomer(b.id);
  await credit(b.id, c.id, 200);
  const reward = await prisma.reward.create({ data: { businessId: b.id, name: "مشروب مجاني", cost: 100 } });
  const cashier = await makeStaff(b.id);
  return { b, c, reward, cashier };
}

const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

describe("الاستبدال بكود لمرة واحدة", () => {
  it("الكود يعمل مرة واحدة فقط", async () => {
    const { c, reward, cashier } = await setup();
    const { code } = await issueRedeemCode(c.id, c.businessId);
    const r = await redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, code, idempotencyKey: idk() });
    expect(r.balance).toBe(100);
    await expect(
      redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, code, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
    expect(await getBalance(c.id, "POINT")).toBe(100);
  });

  it("الكود ينتهي بعد دقيقتين", async () => {
    const { c, reward, cashier } = await setup();
    const t0 = new Date();
    const { code, expiresAt } = await issueRedeemCode(c.id, c.businessId, t0);
    expect(expiresAt.getTime() - t0.getTime()).toBe(120_000);
    await expect(
      redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, code, idempotencyKey: idk() }, new Date(t0.getTime() + 121_000)),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("إصدار كود جديد يُلغي السابق", async () => {
    const { c, reward, cashier } = await setup();
    const first = await issueRedeemCode(c.id, c.businessId);
    await issueRedeemCode(c.id, c.businessId);
    await expect(
      redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, code: first.code, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("قفل بعد محاولات خاطئة، ومدة القفل تتضاعف كل مرة", async () => {
    const { c, reward, cashier } = await setup();
    const t0 = new Date("2026-06-01T10:00:00Z");
    const attempt = (code: string, at: Date) =>
      redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, code, idempotencyKey: idk() }, at);

    const { code } = await issueRedeemCode(c.id, c.businessId, t0);
    await expect(attempt(wrong(code), t0)).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(attempt(wrong(code), t0)).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(attempt(wrong(code), t0)).rejects.toMatchObject({ code: "LOCKED" });
    let guard = await prisma.redeemGuard.findUniqueOrThrow({ where: { customerId: c.id } });
    expect(guard.lockLevel).toBe(1);
    expect(guard.lockedUntil!.getTime() - t0.getTime()).toBe(5 * 60_000);

    // حتى الكود الصحيح مرفوض أثناء القفل
    await expect(attempt(code, new Date(t0.getTime() + 60_000))).rejects.toMatchObject({ code: "LOCKED" });

    // بعد القفل الأول: 3 محاولات خاطئة → قفل 10 دقائق
    const t1 = new Date(t0.getTime() + 6 * 60_000);
    for (let i = 0; i < 2; i++) await expect(attempt("123456", t1)).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(attempt("123456", t1)).rejects.toMatchObject({ code: "LOCKED" });
    guard = await prisma.redeemGuard.findUniqueOrThrow({ where: { customerId: c.id } });
    expect(guard.lockLevel).toBe(2);
    expect(guard.lockedUntil!.getTime() - t1.getTime()).toBe(10 * 60_000);
    expect(lockMinutes({ redeemLockBaseMinutes: 5 }, 3)).toBe(20);

    // تنبيه للأدمن
    expect(await prisma.fraudAlert.count({ where: { customerId: c.id, type: "REDEEM_LOCKOUT" } })).toBeGreaterThan(0);
    expect(await getBalance(c.id, "POINT")).toBe(200);
  });

  it("رصيد غير كافٍ أو مستوى أقل: لا يُستهلك الكود", async () => {
    const { b, c, cashier } = await setup();
    const expensive = await prisma.reward.create({ data: { businessId: b.id, name: "كيكة", cost: 500 } });
    const gold = await prisma.reward.create({ data: { businessId: b.id, name: "ذهبي", cost: 10, minTier: "GOLD" } });
    const { code } = await issueRedeemCode(c.id, c.businessId);
    await expect(
      redeemReward(cashier.actor, { customerId: c.id, rewardId: expensive.id, code, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    await expect(
      redeemReward(cashier.actor, { customerId: c.id, rewardId: gold.id, code, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.redeemCode.count({ where: { customerId: c.id, usedAt: { not: null } } })).toBe(0);
  });

  it("إعادة الإرسال بنفس المفتاح لا تخصم مرتين", async () => {
    const { c, reward, cashier } = await setup();
    const { code } = await issueRedeemCode(c.id, c.businessId);
    const key = idk();
    await redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, code, idempotencyKey: key });
    const again = await redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, code, idempotencyKey: key });
    expect(again.replayed).toBe(true);
    expect(await getBalance(c.id, "POINT")).toBe(100);
  });

  it("الكود يظهر للعميل فقط ولا يظهر في ردود الكاشير", async () => {
    const { c, reward, cashier } = await setup();
    const codeRes = await codeRoute(
      apiRequest("POST", `/api/card/${c.id}/redeem-code`, { headers: { "x-card-key": cardKey(c) } }),
      params({ id: c.id }),
    );
    const { data } = await json(codeRes);
    expect(data.code).toMatch(/^\d{6}$/);
    const res = await redeemRoute(
      apiRequest("POST", "/api/cashier/redeem", {
        token: cashier.token,
        body: { customerId: c.id, rewardId: reward.id, code: data.code, idempotencyKey: idk() },
      }),
    );
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(data.code);
    // الكود لا يُخزَّن نصاً صريحاً
    const stored = await prisma.redeemCode.findFirstOrThrow({ where: { customerId: c.id } });
    expect(JSON.stringify(stored)).not.toContain(data.code);
  });

  it("طلب كود بمفتاح بطاقة خاطئ مرفوض", async () => {
    const { c } = await setup();
    const res = await codeRoute(
      apiRequest("POST", `/api/card/${c.id}/redeem-code`, { headers: { "x-card-key": "wrong-key" } }),
      params({ id: c.id }),
    );
    expect(res.status).toBe(404);
  });
});
