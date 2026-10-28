import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getBalance } from "@/modules/ledger";
import { redeemReward } from "@/modules/redeem";
import { issuePresenceToken, issueQrToken, PRESENCE_TTL_SECONDS } from "@/modules/qr";
import { POST as redeemRoute } from "@/app/api/cashier/redeem/route";
import { POST as lookupRoute } from "@/app/api/cashier/lookup/route";
import { apiRequest, credit, idk, json, makeBusiness, makeCustomer, makeStaff } from "./helpers";

async function setup(settings = {}) {
  const b = await makeBusiness(settings);
  const c = await makeCustomer(b.id);
  await credit(b.id, c.id, 200);
  const reward = await prisma.reward.create({ data: { businessId: b.id, name: "مشروب مجاني", cost: 100 } });
  const cashier = await makeStaff(b.id);
  return { b, c, reward, cashier };
}

describe("الاستبدال بمسح QR العميل (بدون رمز)", () => {
  it("مسح QR يعطي الكاشير توكن حضور يكفي للاستبدال", async () => {
    const { c, reward, cashier } = await setup();
    const lookup = await json(
      await lookupRoute(apiRequest("POST", "/api/cashier/lookup", { token: cashier.token, body: { qr: issueQrToken(c.id, 60) } })),
    );
    expect(lookup.data.presence).toMatch(/^P1\./);
    const res = await redeemRoute(
      apiRequest("POST", "/api/cashier/redeem", {
        token: cashier.token,
        body: { customerId: c.id, rewardId: reward.id, presence: lookup.data.presence, idempotencyKey: idk() },
      }),
    );
    expect(res.status).toBe(200);
    expect(await getBalance(c.id, "POINT")).toBe(100);
  });

  it("البحث بالجوال لا يعطي توكن حضور، والاستبدال بدونه مرفوض", async () => {
    const { c, reward, cashier } = await setup();
    const lookup = await json(
      await lookupRoute(apiRequest("POST", "/api/cashier/lookup", { token: cashier.token, body: { phone: c.phone } })),
    );
    expect(lookup.data.presence).toBeUndefined();
    await expect(
      redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, presence: "", idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "SCAN_REQUIRED" });
    expect(await getBalance(c.id, "POINT")).toBe(200);
  });

  it("توكن عميل آخر أو منتهي أو مزوّر مرفوض", async () => {
    const { b, c, reward, cashier } = await setup();
    const other = await makeCustomer(b.id);
    const t0 = new Date();
    const attempt = (presence: string, at = t0) =>
      redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, presence, idempotencyKey: idk() }, at);
    await expect(attempt(issuePresenceToken(other.id, t0))).rejects.toMatchObject({ code: "SCAN_REQUIRED" });
    await expect(
      attempt(issuePresenceToken(c.id, t0), new Date(t0.getTime() + (PRESENCE_TTL_SECONDS + 1) * 1000)),
    ).rejects.toMatchObject({ code: "SCAN_REQUIRED" });
    const forged = issuePresenceToken(c.id, t0).replace(/\.[^.]+$/, ".AAAAAAAAAAAAAAAAAAAAAA");
    await expect(attempt(forged)).rejects.toMatchObject({ code: "SCAN_REQUIRED" });
    // توكن QR البطاقة نفسه ليس توكن حضور
    await expect(attempt(issueQrToken(c.id, 60, t0))).rejects.toMatchObject({ code: "SCAN_REQUIRED" });
    expect(await getBalance(c.id, "POINT")).toBe(200);
  });

  it("رصيد غير كافٍ أو مستوى أقل مرفوض", async () => {
    const { b, c, cashier } = await setup();
    const expensive = await prisma.reward.create({ data: { businessId: b.id, name: "كيكة", cost: 500 } });
    const gold = await prisma.reward.create({ data: { businessId: b.id, name: "ذهبي", cost: 10, minTier: "GOLD" } });
    const presence = issuePresenceToken(c.id);
    await expect(
      redeemReward(cashier.actor, { customerId: c.id, rewardId: expensive.id, presence, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    await expect(
      redeemReward(cashier.actor, { customerId: c.id, rewardId: gold.id, presence, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getBalance(c.id, "POINT")).toBe(200);
  });

  it("إعادة الإرسال بنفس المفتاح لا تخصم مرتين", async () => {
    const { c, reward, cashier } = await setup();
    const presence = issuePresenceToken(c.id);
    const key = idk();
    await redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, presence, idempotencyKey: key });
    const again = await redeemReward(cashier.actor, { customerId: c.id, rewardId: reward.id, presence, idempotencyKey: key });
    expect(again.replayed).toBe(true);
    expect(await getBalance(c.id, "POINT")).toBe(100);
  });
});
