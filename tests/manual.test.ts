import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getBalance } from "@/modules/ledger";
import { manualAdjust } from "@/modules/manual";
import { idk, makeBusiness, makeCustomer, makeStaff } from "./helpers";

describe("الإضافة اليدوية بدون طلب", () => {
  it("تحتاج صلاحية مدير", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id, "CASHIER");
    await expect(
      manualAdjust(actor, { customerId: c.id, points: 10, reason: "تعويض العميل", idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("السبب إجباري", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id, "MANAGER");
    await expect(manualAdjust(actor, { customerId: c.id, points: 10, reason: "  ", idempotencyKey: idk() })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const r = await manualAdjust(actor, { customerId: c.id, points: 10, reason: "تعويض عن طلب متأخر", idempotencyKey: idk() });
    expect(r.entry.reason).toBe("تعويض عن طلب متأخر");
    expect(r.entry.staffId).toBe(actor.staffId);
    expect(await getBalance(c.id, "POINT")).toBe(10);
  });

  it("حد عدد الإضافات اليدوية لكل موظف في الوردية", async () => {
    const b = await makeBusiness({ manualMaxPerShift: 2, manualMaxPointsPerShift: 1000, shiftHours: 8 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id, "MANAGER");
    const t0 = new Date("2026-04-01T08:00:00Z");
    const add = (h: number) =>
      manualAdjust(actor, { customerId: c.id, points: 5, reason: "تعويض العميل", idempotencyKey: idk() }, new Date(t0.getTime() + h * 3600_000));
    await add(0);
    await add(1);
    await expect(add(2)).rejects.toMatchObject({ code: "SHIFT_LIMIT" });
    expect(await prisma.fraudAlert.count({ where: { staffId: actor.staffId, type: "MANUAL_LIMIT_REACHED" } })).toBe(1);
    // وردية جديدة
    await expect(add(9)).resolves.toBeTruthy();
  });

  it("حد مجموع النقاط اليدوية في الوردية", async () => {
    const b = await makeBusiness({ manualMaxPerShift: 10, manualMaxPointsPerShift: 100 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id, "MANAGER");
    await manualAdjust(actor, { customerId: c.id, points: 80, reason: "تعويض العميل", idempotencyKey: idk() });
    await expect(
      manualAdjust(actor, { customerId: c.id, points: 30, reason: "تعويض العميل", idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "SHIFT_LIMIT" });
    expect(await getBalance(c.id, "POINT")).toBe(80);
  });

  it("إعادة الإرسال بنفس المفتاح لا تكرر الإضافة", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id, "MANAGER");
    const key = idk();
    await manualAdjust(actor, { customerId: c.id, points: 15, reason: "تعويض العميل", idempotencyKey: key });
    const again = await manualAdjust(actor, { customerId: c.id, points: 15, reason: "تعويض العميل", idempotencyKey: key });
    expect(again.replayed).toBe(true);
    expect(await getBalance(c.id, "POINT")).toBe(15);
  });
});
