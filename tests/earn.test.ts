import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getBalance } from "@/modules/ledger";
import { earnForOrder, refundOrder } from "@/modules/orders";
import { POST as earnRoute } from "@/app/api/cashier/earn/route";
import { POST as refundRoute } from "@/app/api/cashier/refund/route";
import { apiRequest, idk, json, makeBusiness, makeCustomer, makeStaff, uid } from "./helpers";

const ref = () => `ORD-${uid()}`;

describe("إضافة النقاط للطلبات", () => {
  it("النقاط تُحسب في السيرفر من المبلغ", async () => {
    const b = await makeBusiness({ pointsPerSar: 2 });
    const c = await makeCustomer(b.id);
    const { token, deviceId } = await makeStaff(b.id);
    const res = await earnRoute(
      apiRequest("POST", "/api/cashier/earn", {
        token,
        deviceId,
        body: { customerId: c.id, externalRef: ref(), amount: "25.75", idempotencyKey: idk() },
      }),
    );
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.data.points).toBe(51); // floor(25.75 × 2)
    expect(await getBalance(c.id, "POINT")).toBe(51);
  });

  it("الكاشير لا يستطيع إرسال عدد النقاط (حقل مرفوض)", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { token } = await makeStaff(b.id);
    const res = await earnRoute(
      apiRequest("POST", "/api/cashier/earn", {
        token,
        body: { customerId: c.id, externalRef: ref(), amount: "10", idempotencyKey: idk(), points: 5000 },
      }),
    );
    expect(res.status).toBe(400);
    expect(await getBalance(c.id, "POINT")).toBe(0);
  });

  it("نفس رقم الطلب لا يُحتسب مرتين (حتى بمفتاح مختلف أو لعميل آخر)", async () => {
    const b = await makeBusiness();
    const c1 = await makeCustomer(b.id);
    const c2 = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    const r = ref();
    await earnForOrder(actor, { customerId: c1.id, externalRef: r, amountHalalas: 1000, idempotencyKey: idk() });
    await expect(
      earnForOrder(actor, { customerId: c1.id, externalRef: r, amountHalalas: 1000, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "DUPLICATE_ORDER" });
    await expect(
      earnForOrder(actor, { customerId: c2.id, externalRef: r, amountHalalas: 1000, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "DUPLICATE_ORDER" });
    expect(await getBalance(c1.id, "POINT")).toBe(10);
    expect(await getBalance(c2.id, "POINT")).toBe(0);
  });

  it("إعادة الإرسال بنفس idempotency key تعيد نفس النتيجة دون احتساب جديد", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    const input = { customerId: c.id, externalRef: ref(), amountHalalas: 1500, idempotencyKey: idk() };
    const first = await earnForOrder(actor, input);
    const second = await earnForOrder(actor, input);
    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(await prisma.ledgerEntry.count({ where: { customerId: c.id } })).toBe(1);
    await expect(earnForOrder(actor, { ...input, externalRef: ref() })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("طلبان متزامنان بنفس الرقم: يُحتسب واحد فقط", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    const r = ref();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => earnForOrder(actor, { customerId: c.id, externalRef: r, amountHalalas: 2000, idempotencyKey: idk() })),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await getBalance(c.id, "POINT")).toBe(20);
  });

  it("كل عملية تحفظ الموظف والوقت والجهاز وIP", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { token, deviceId, staff } = await makeStaff(b.id);
    await earnRoute(
      apiRequest("POST", "/api/cashier/earn", {
        token,
        deviceId,
        ip: "203.0.113.7",
        body: { customerId: c.id, externalRef: ref(), amount: 12, idempotencyKey: idk() },
      }),
    );
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { customerId: c.id } });
    expect(entry).toMatchObject({ staffId: staff.id, deviceId, ip: "203.0.113.7", userAgent: "vitest-agent" });
    expect(entry.createdAt).toBeInstanceOf(Date);
    const order = await prisma.order.findFirstOrThrow({ where: { customerId: c.id } });
    expect(order).toMatchObject({ staffId: staff.id, deviceId, ip: "203.0.113.7" });
  });

  it("السقف اليومي لعدد العمليات", async () => {
    const b = await makeBusiness({ dailyMaxEarnTxns: 2 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    const now = new Date("2026-05-10T09:00:00Z");
    const earn = (m: number) =>
      earnForOrder(actor, { customerId: c.id, externalRef: ref(), amountHalalas: 1000, idempotencyKey: idk() }, new Date(now.getTime() + m * 60000));
    await earn(0);
    await earn(1);
    await expect(earn(2)).rejects.toMatchObject({ code: "DAILY_CAP" });
    // اليوم التالي بتوقيت الرياض
    await expect(earn(24 * 60)).resolves.toBeTruthy();
  });

  it("السقف اليومي لمجموع النقاط", async () => {
    const b = await makeBusiness({ dailyMaxEarnPoints: 100 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    await earnForOrder(actor, { customerId: c.id, externalRef: ref(), amountHalalas: 8000, idempotencyKey: idk() });
    await expect(
      earnForOrder(actor, { customerId: c.id, externalRef: ref(), amountHalalas: 3000, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "DAILY_CAP" });
    expect(await getBalance(c.id, "POINT")).toBe(80);
  });

  it("فترة الانتظار بين عمليتين لنفس العميل", async () => {
    const b = await makeBusiness({ cooldownSeconds: 300 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    const t0 = new Date("2026-05-10T10:00:00Z");
    const earn = (sec: number) =>
      earnForOrder(actor, { customerId: c.id, externalRef: ref(), amountHalalas: 1000, idempotencyKey: idk() }, new Date(t0.getTime() + sec * 1000));
    await earn(0);
    await expect(earn(60)).rejects.toMatchObject({ code: "COOLDOWN" });
    await expect(earn(301)).resolves.toBeTruthy();
  });

  it("المبلغ يتجاوز الحد الأقصى للطلب مرفوض", async () => {
    const b = await makeBusiness({ maxOrderAmountHalalas: 50000 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    await expect(
      earnForOrder(actor, { customerId: c.id, externalRef: ref(), amountHalalas: 50001, idempotencyKey: idk() }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("المرتجع", () => {
  it("المرتجع يعكس النقاط تلقائياً ولا يتكرر", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { actor, token } = await makeStaff(b.id);
    const r = ref();
    await earnForOrder(actor, { customerId: c.id, externalRef: r, amountHalalas: 4500, idempotencyKey: idk() });
    expect(await getBalance(c.id, "POINT")).toBe(45);
    const res = await refundRoute(apiRequest("POST", "/api/cashier/refund", { token, body: { externalRef: r } }));
    expect(res.status).toBe(200);
    expect(await getBalance(c.id, "POINT")).toBe(0);
    const reversal = await prisma.ledgerEntry.findFirstOrThrow({ where: { customerId: c.id, type: "REFUND_REVERSAL" } });
    expect(reversal.points).toBe(-45);
    expect(reversal.reason).toContain(r);
    await expect(refundOrder(actor, { externalRef: r })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await prisma.order.findFirstOrThrow({ where: { externalRef: r, businessId: b.id } })).status).toBe("REFUNDED");
  });

  it("المرتجع يعكس مكافأة التسجيل المرتبطة بأول طلب", async () => {
    const b = await makeBusiness({ signupBonus: 20 });
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id);
    const r = ref();
    await earnForOrder(actor, { customerId: c.id, externalRef: r, amountHalalas: 1000, idempotencyKey: idk() });
    expect(await getBalance(c.id, "POINT")).toBe(30);
    await refundOrder(actor, { externalRef: r });
    expect(await getBalance(c.id, "POINT")).toBe(0);
  });
});
