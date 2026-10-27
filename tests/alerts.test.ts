import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { earnForOrder } from "@/modules/orders";
import { issueRedeemCode, redeemReward } from "@/modules/redeem";
import { updateSettings } from "@/modules/admin";
import { credit, idk, makeBusiness, makeCustomer, makeStaff, uid } from "./helpers";

describe("تنبيهات التلاعب للأدمن", () => {
  it("كاشير يضيف لنفس العميل بكثرة", async () => {
    const b = await makeBusiness({ alertSameCustomerCount: 3, alertSameCustomerWindowHours: 24 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    for (let i = 0; i < 3; i++) {
      await earnForOrder(actor, { customerId: c.id, externalRef: `A${uid()}`, amountHalalas: 1000, idempotencyKey: idk() });
    }
    const alert = await prisma.fraudAlert.findFirstOrThrow({ where: { customerId: c.id, type: "FREQUENT_SAME_CUSTOMER" } });
    expect(alert.staffId).toBe(actor.staffId);
  });

  it("استبدالات متتالية", async () => {
    const b = await makeBusiness({ alertRedemptionsCount: 2, alertRedemptionsWindowHours: 24 });
    const c = await makeCustomer(b.id);
    await credit(b.id, c.id, 500);
    const reward = await prisma.reward.create({ data: { businessId: b.id, name: "قهوة", cost: 10 } });
    const { actor } = await makeStaff(b.id);
    for (let i = 0; i < 2; i++) {
      const { code } = await issueRedeemCode(c.id, b.id);
      await redeemReward(actor, { customerId: c.id, rewardId: reward.id, code, idempotencyKey: idk() });
    }
    expect(await prisma.fraudAlert.count({ where: { customerId: c.id, type: "CONSECUTIVE_REDEMPTIONS" } })).toBe(1);
  });

  it("عمليات خارج الدوام", async () => {
    // الدوام 07:00–23:00 بتوقيت الرياض؛ العملية 01:30 الرياض = 22:30 UTC
    const b = await makeBusiness({ openMinute: 420, closeMinute: 1380 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    await earnForOrder(
      actor,
      { customerId: c.id, externalRef: `N${uid()}`, amountHalalas: 1000, idempotencyKey: idk() },
      new Date("2026-07-01T22:30:00Z"),
    );
    expect(await prisma.fraudAlert.count({ where: { customerId: c.id, type: "OFF_HOURS" } })).toBe(1);
    const c2 = await makeCustomer(b.id);
    await earnForOrder(
      actor,
      { customerId: c2.id, externalRef: `D${uid()}`, amountHalalas: 1000, idempotencyKey: idk() },
      new Date("2026-07-01T09:00:00Z"),
    );
    expect(await prisma.fraudAlert.count({ where: { customerId: c2.id, type: "OFF_HOURS" } })).toBe(0);
  });
});

describe("AuditLog", () => {
  it("تغيير الإعدادات يُسجَّل بالقيم قبل وبعد مع الموظف والجهاز وIP", async () => {
    const b = await makeBusiness({ pointsPerSar: 1 });
    const { actor } = await makeStaff(b.id, "ADMIN");
    await updateSettings(actor, { pointsPerSar: 3, dailyMaxEarnTxns: 7 });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { businessId: b.id, action: "settings.update" } });
    expect(log.before).toMatchObject({ pointsPerSar: 1 });
    expect(log.after).toMatchObject({ pointsPerSar: 3, dailyMaxEarnTxns: 7 });
    expect(log).toMatchObject({ staffId: actor.staffId, ip: actor.ip, deviceId: actor.deviceId });
  });

  it("المدير لا يستطيع تغيير الإعدادات", async () => {
    const b = await makeBusiness();
    const { actor } = await makeStaff(b.id, "MANAGER");
    await expect(updateSettings(actor, { pointsPerSar: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
