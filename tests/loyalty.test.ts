import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getBalance } from "@/modules/ledger";
import { earnForOrder } from "@/modules/orders";
import { campaignMultiplierPct, computeEarn, tierForSpend } from "@/modules/rules";
import { runExpiry } from "@/modules/expiry";
import { runBirthdayBonuses } from "@/modules/bonuses";
import { registerCustomer } from "@/modules/customers";
import { PATCH as prefsRoute } from "@/app/api/card/[id]/prefs/route";
import { cardKey } from "@/modules/customers";
import { apiRequest, credit, idk, makeBusiness, makeCustomer, makeStaff, nextPhone, params, uid } from "./helpers";

const RIYADH = "Asia/Riyadh";
const order = (actor: Parameters<typeof earnForOrder>[0], customerId: string, halalas: number, at?: Date) =>
  earnForOrder(actor, { customerId, externalRef: `O${uid()}`, amountHalalas: halalas, idempotencyKey: idk() }, at);

describe("المستويات", () => {
  it("المستوى من الإنفاق خلال 365 يوماً، والذهبي يحصل نقاطاً أكثر", async () => {
    const s = { silverSpendSar: 300, goldSpendSar: 1000 };
    expect(tierForSpend(29_999, s)).toBe("BRONZE");
    expect(tierForSpend(30_000, s)).toBe("SILVER");
    expect(tierForSpend(100_000, s)).toBe("GOLD");

    const b = await makeBusiness({ silverSpendSar: 300, goldSpendSar: 1000, goldMultiplierPct: 150, dailyMaxEarnPoints: 1_000_000 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    await order(actor, c.id, 100_000); // 1000 ريال → يصبح ذهبياً بعد هذا الطلب
    const r = await order(actor, c.id, 10_000);
    expect(r.points).toBe(150);
    expect(r.calc.tierPct).toBe(150);
  });
});

describe("الحملات (نقاط مضاعفة)", () => {
  it("المضاعفة داخل فترة الحملة ونافذة ساعات الهدوء فقط", () => {
    const campaign = {
      active: true,
      startsAt: new Date("2026-08-01T00:00:00Z"),
      endsAt: new Date("2026-08-31T00:00:00Z"),
      startMinute: 14 * 60, // 14:00–17:00 الرياض
      endMinute: 17 * 60,
      daysMask: 127,
      multiplierPct: 200,
    };
    expect(campaignMultiplierPct([campaign], new Date("2026-08-10T12:00:00Z"), RIYADH)).toBe(200); // 15:00 الرياض
    expect(campaignMultiplierPct([campaign], new Date("2026-08-10T16:00:00Z"), RIYADH)).toBe(100); // 19:00
    expect(campaignMultiplierPct([campaign], new Date("2026-09-10T12:00:00Z"), RIYADH)).toBe(100); // بعد الانتهاء
    expect(campaignMultiplierPct([{ ...campaign, active: false }], new Date("2026-08-10T12:00:00Z"), RIYADH)).toBe(100);
    // أيام محددة: الجمعة فقط (bit 5)؛ 2026-08-10 يوم اثنين
    expect(campaignMultiplierPct([{ ...campaign, daysMask: 1 << 5 }], new Date("2026-08-10T12:00:00Z"), RIYADH)).toBe(100);
  });

  it("الطلب أثناء الحملة يحصل ضعف النقاط", async () => {
    const b = await makeBusiness();
    await prisma.campaign.create({
      data: {
        businessId: b.id,
        name: "ساعات الهدوء",
        multiplierPct: 200,
        startsAt: new Date("2026-08-01T00:00:00Z"),
        endsAt: new Date("2026-09-01T00:00:00Z"),
        startMinute: 14 * 60,
        endMinute: 17 * 60,
      },
    });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    expect((await order(actor, c.id, 2000, new Date("2026-08-10T12:00:00Z"))).points).toBe(40);
    expect((await order(actor, c.id, 2000, new Date("2026-08-10T18:00:00Z"))).points).toBe(20);
  });
});

describe("الختمات كبديل للنقاط", () => {
  it("كل طلب مؤهل = ختم واحد (والحملة ×2 = ختمان)", async () => {
    const calc = computeEarn(
      { programMode: "STAMPS", pointsPerSar: 1, minStampAmountHalalas: 1000, silverMultiplierPct: 100, goldMultiplierPct: 100 },
      1500,
      "GOLD",
      100,
    );
    expect(calc).toMatchObject({ unit: "STAMP", points: 1 });
    const b = await makeBusiness({ programMode: "STAMPS", minStampAmountHalalas: 1000 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    await order(actor, c.id, 1200);
    await order(actor, c.id, 500); // أقل من الحد: لا ختم
    expect(await getBalance(c.id, "STAMP")).toBe(1);
    expect(await getBalance(c.id, "POINT")).toBe(0);
  });
});

describe("انتهاء صلاحية النقاط", () => {
  it("تنتهي النقاط الأقدم أولاً (FIFO) بحركة EXPIRY جديدة", async () => {
    const b = await makeBusiness({ pointsExpiryDays: 30, expiryWarningDays: 7 });
    const c = await makeCustomer(b.id);
    const now = new Date("2026-10-01T12:00:00Z");
    await credit(b.id, c.id, 100, { expiresAt: new Date("2026-09-25T00:00:00Z") }); // منتهية
    await credit(b.id, c.id, 50, { expiresAt: new Date("2026-12-01T00:00:00Z") });
    await credit(b.id, c.id, -30, { type: "REDEEM", reason: null }); // استهلاك من الأقدم
    const r = await runExpiry(b.id, now);
    expect(r.expiredCustomers).toBe(1);
    expect(await getBalance(c.id, "POINT")).toBe(50);
    const exp = await prisma.ledgerEntry.findFirstOrThrow({ where: { customerId: c.id, type: "EXPIRY" } });
    expect(exp.points).toBe(-70);
    // التشغيل مرة ثانية لا يكرر
    await runExpiry(b.id, now);
    expect(await getBalance(c.id, "POINT")).toBe(50);
  });

  it("تنبيه قبل الانتهاء مرة واحدة لكل فترة (عبر WalletSyncJob)", async () => {
    const b = await makeBusiness({ pointsExpiryDays: 30, expiryWarningDays: 7 });
    const c = await makeCustomer(b.id);
    await prisma.walletPass.create({
      data: { businessId: b.id, customerId: c.id, platform: "APPLE", serial: `s${uid()}`, authToken: `t${uid()}${uid()}` },
    });
    const now = new Date("2026-10-01T12:00:00Z");
    await credit(b.id, c.id, 40, { expiresAt: new Date("2026-10-05T00:00:00Z") });
    const r = await runExpiry(b.id, now);
    expect(r.warned).toBe(1);
    const job = await prisma.walletSyncJob.findFirstOrThrow({ where: { walletPass: { customerId: c.id }, kind: "NOTICE" } });
    expect(String((job.payload as { text: string }).text)).toContain("40");
    expect((await runExpiry(b.id, now)).warned).toBe(0);
    expect(await getBalance(c.id, "POINT")).toBe(40);
  });

  it("الطلبات تأخذ تاريخ صلاحية حسب الإعداد", async () => {
    const b = await makeBusiness({ pointsExpiryDays: 90 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    const at = new Date("2026-02-01T10:00:00Z");
    const r = await order(actor, c.id, 1000, at);
    expect(r.entry!.expiresAt!.getTime() - at.getTime()).toBe(90 * 86_400_000);
  });
});

describe("مكافأة التسجيل والميلاد", () => {
  it("مكافأة التسجيل تُمنح مع أول طلب فقط", async () => {
    const b = await makeBusiness({ signupBonus: 25 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    expect(await getBalance(c.id, "POINT")).toBe(0);
    await order(actor, c.id, 1000);
    await order(actor, c.id, 1000);
    expect(await getBalance(c.id, "POINT")).toBe(45);
    expect(await prisma.ledgerEntry.count({ where: { customerId: c.id, type: "SIGNUP_BONUS" } })).toBe(1);
  });

  it("مكافأة الميلاد مرة في السنة ولعميل له طلب سابق فقط", async () => {
    const b = await makeBusiness({ birthdayBonus: 50 });
    const { actor } = await makeStaff(b.id);
    const withOrder = await makeCustomer(b.id, { birthMonth: 3, birthDay: 15 });
    const noOrder = await makeCustomer(b.id, { birthMonth: 3, birthDay: 15 });
    await order(actor, withOrder.id, 1000, new Date("2026-01-10T10:00:00Z"));
    const bday = new Date("2026-03-15T09:00:00Z");
    expect(await runBirthdayBonuses(b.id, bday)).toBe(1);
    expect(await runBirthdayBonuses(b.id, bday)).toBe(0);
    expect(await getBalance(withOrder.id, "POINT")).toBe(60);
    expect(await getBalance(noOrder.id, "POINT")).toBe(0);
  });

  it("تاريخ الميلاد يُضاف مرة واحدة ولا يمكن تغييره", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const patch = (body: object) =>
      prefsRoute(apiRequest("PATCH", `/api/card/${c.id}`, { headers: { "x-card-key": cardKey(c) }, body }), params({ id: c.id }));
    expect((await patch({ birthMonth: 5, birthDay: 20 })).status).toBe(200);
    expect((await patch({ birthMonth: 6, birthDay: 1 })).status).toBe(409);
    expect((await patch({ promoOptOut: true })).status).toBe(200);
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ birthMonth: 5, promoOptOut: true });
  });
});

describe("إحالة صديق", () => {
  async function referralSetup(settings = {}) {
    const b = await makeBusiness({ referralBonusReferee: 30, referralBonusReferrer: 40, referralMonthlyCap: 5, ...settings });
    const { actor } = await makeStaff(b.id);
    const ref = await registerCustomer(b.id, { name: "المُحيل", phone: nextPhone() }, { ip: "10.10.10.1", deviceId: "deviceAAAAAAAAAAAAAA", userAgent: "x" });
    await order(actor, ref.customer.id, 1000);
    return { b, actor, referrer: ref.customer };
  }

  it("نقاط للطرفين بعد أول طلب للمُحال فقط", async () => {
    const { b, actor, referrer } = await referralSetup();
    const { customer } = await registerCustomer(
      b.id,
      { name: "صديق", phone: nextPhone(), referralCode: referrer.referralCode },
      { ip: "10.20.20.2", deviceId: "deviceBBBBBBBBBBBBBB", userAgent: "y" },
    );
    expect(await getBalance(customer.id, "POINT")).toBe(0);
    expect(await getBalance(referrer.id, "POINT")).toBe(10);
    await order(actor, customer.id, 1000);
    expect(await getBalance(customer.id, "POINT")).toBe(40); // 10 + 30
    expect(await getBalance(referrer.id, "POINT")).toBe(50); // 10 + 40
    await order(actor, customer.id, 1000);
    expect(await getBalance(referrer.id, "POINT")).toBe(50);
  });

  it("منع إحالة النفس: نفس الجهاز أو نفس الشبكة", async () => {
    const { b, actor, referrer } = await referralSetup();
    const sameDevice = await registerCustomer(
      b.id,
      { name: "حساب ثاني", phone: nextPhone(), referralCode: referrer.referralCode },
      { ip: "10.30.30.3", deviceId: "deviceAAAAAAAAAAAAAA", userAgent: "x" },
    );
    const sameIp = await registerCustomer(
      b.id,
      { name: "حساب ثالث", phone: nextPhone(), referralCode: referrer.referralCode },
      { ip: "10.10.10.1", deviceId: "deviceCCCCCCCCCCCCCC", userAgent: "x" },
    );
    await order(actor, sameDevice.customer.id, 1000);
    await order(actor, sameIp.customer.id, 1000);
    expect(await getBalance(referrer.id, "POINT")).toBe(10);
    expect(await prisma.ledgerEntry.count({ where: { type: "REFERRAL_BONUS", customerId: { in: [sameDevice.customer.id, sameIp.customer.id] } } })).toBe(0);
  });

  it("منع الحسابات المكررة: نفس الجوال لا يُسجَّل مرتين، والكود الخاطئ مرفوض", async () => {
    const { b, referrer } = await referralSetup();
    await expect(
      registerCustomer(b.id, { name: "مكرر", phone: referrer.phone }, { ip: "1.1.1.1", deviceId: null, userAgent: "" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      registerCustomer(b.id, { name: "خطأ", phone: nextPhone(), referralCode: "NOPE99" }, { ip: "1.1.1.2", deviceId: null, userAgent: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("سقف شهري لمكافآت الإحالة لكل مُحيل", async () => {
    const { b, actor, referrer } = await referralSetup({ referralMonthlyCap: 1 });
    for (let i = 0; i < 2; i++) {
      const { customer } = await registerCustomer(
        b.id,
        { name: `صديق ${i}`, phone: nextPhone(), referralCode: referrer.referralCode },
        { ip: `10.40.0.${i}`, deviceId: `deviceZZZZZZZZZZZ${i}`, userAgent: "x" },
      );
      await order(actor, customer.id, 1000);
    }
    expect(await getBalance(referrer.id, "POINT")).toBe(50);
  });
});
