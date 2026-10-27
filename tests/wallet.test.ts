import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buildApplePassJson } from "@/modules/wallet/apple";
import { buildGoogleObject } from "@/modules/wallet/google";
import { buildCardModel, ensurePass } from "@/modules/wallet/card";
import { backoffMs, processDueJobs } from "@/modules/wallet/sync";
import { saveLocation } from "@/modules/catalog";
import { updateSettings } from "@/modules/admin";
import { earnForOrder } from "@/modules/orders";
import { verifyQrToken } from "@/modules/qr";
import { POST as registerDevice, DELETE as unregisterDevice } from "@/app/api/wallet/apple/v1/devices/[deviceId]/registrations/[passTypeId]/[serial]/route";
import { GET as serials } from "@/app/api/wallet/apple/v1/devices/[deviceId]/registrations/[passTypeId]/route";
import { GET as latestPass } from "@/app/api/wallet/apple/v1/passes/[passTypeId]/[serial]/route";
import { apiRequest, credit, idk, makeBusiness, makeCustomer, makeStaff, params, uid } from "./helpers";

const PASS_TYPE = "pass.test.shahiqamra";

async function withPasses(n: number, settings = {}) {
  const b = await makeBusiness(settings);
  const customers = [];
  for (let i = 0; i < n; i++) {
    const c = await makeCustomer(b.id, { name: "نورة العتيبي" });
    await ensurePass(c, i % 2 === 0 ? "APPLE" : "GOOGLE");
    customers.push(c);
  }
  return { b, customers };
}

describe("بطاقة Apple: pass.json", () => {
  it("تتضمن locations الصحيحة مع relevantText بالعربي ورصيد العميل وmaxDistance", async () => {
    const { b, customers } = await withPasses(1);
    const { actor } = await makeStaff(b.id, "ADMIN");
    await credit(b.id, customers[0].id, 120);
    await saveLocation(actor, null, {
      name: "الفرع الرئيسي",
      latitude: 24.7136,
      longitude: 46.6753,
      relevantText: "حياك في شاهي قمرا، رصيدك {points} نقطة",
      maxDistance: 100,
      active: true,
    });
    await saveLocation(actor, null, {
      name: "فرع معطّل",
      latitude: 21.5,
      longitude: 39.2,
      relevantText: "x x",
      maxDistance: 300,
      active: false,
    });
    const pass = await prisma.walletPass.findFirstOrThrow({ where: { customerId: customers[0].id } });
    const json = buildApplePassJson(await buildCardModel(pass)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(json.locations).toEqual([
      { latitude: 24.7136, longitude: 46.6753, relevantText: "حياك في شاهي قمرا، رصيدك 120 نقطة" },
    ]);
    expect(json.maxDistance).toBe(100);
    expect(json.webServiceURL).toBe("https://loyalty.test/api/wallet/apple");
    expect(json.authenticationToken).toBe(pass.authToken);
    expect(json.authenticationToken.length).toBeGreaterThanOrEqual(16);
    expect(json.storeCard.primaryFields[0]).toMatchObject({ key: "balance", value: 120 });
    // QR موقّع ولا يحتوي الجوال
    const qr = json.barcodes[0].message as string;
    expect(qr).not.toContain(customers[0].phone.slice(-9));
    expect(verifyQrToken(qr)).toMatchObject({ ok: true, customerId: customers[0].id });
  });

  it("الحد الأقصى 10 مواقع فعّالة", async () => {
    const b = await makeBusiness();
    const { actor } = await makeStaff(b.id, "ADMIN");
    const loc = (i: number) => ({ name: `فرع ${i}`, latitude: 24 + i / 100, longitude: 46, relevantText: "حياك", maxDistance: 100, active: true });
    for (let i = 0; i < 10; i++) await saveLocation(actor, null, loc(i));
    await expect(saveLocation(actor, null, loc(11))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("رسالة العرض: changeMessage فقط إذا سُمح بالإشعار", async () => {
    const { customers } = await withPasses(1);
    const pass = await prisma.walletPass.findFirstOrThrow({ where: { customerId: customers[0].id } });
    const model = await buildCardModel({ ...pass, offerText: "خصم 20% اليوم", offerNotify: true });
    const offer = (buildApplePassJson(model) as any).storeCard.backFields.find((f: any) => f.key === "offer"); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(offer).toMatchObject({ value: "خصم 20% اليوم", changeMessage: "%@" });
    const silent = (buildApplePassJson({ ...model, offerNotify: false }) as any).storeCard.backFields.find((f: any) => f.key === "offer"); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(silent.changeMessage).toBeUndefined();
  });
});

describe("Google Wallet", () => {
  it("كائن الولاء يحتوي الرصيد وQR وmerchantLocations", async () => {
    const { b, customers } = await withPasses(2);
    const { actor } = await makeStaff(b.id, "ADMIN");
    await saveLocation(actor, null, { name: "الرئيسي", latitude: 24.7, longitude: 46.6, relevantText: "حياك {name}", maxDistance: 80, active: true });
    await credit(b.id, customers[1].id, 33);
    const pass = await prisma.walletPass.findFirstOrThrow({ where: { customerId: customers[1].id } });
    expect(pass.platform).toBe("GOOGLE");
    const obj = buildGoogleObject(await buildCardModel(pass));
    expect(obj.loyaltyPoints.balance).toEqual({ int: 33 });
    expect(obj.merchantLocations).toEqual([{ latitude: 24.7, longitude: 46.6 }]);
    expect(obj.barcode.type).toBe("QR_CODE");
    expect(obj.barcode.value).not.toContain(customers[1].phone);
  });
});

describe("WalletSyncJob", () => {
  it("تحديث فرع يولّد WalletSyncJob لكل بطاقة", async () => {
    const { b } = await withPasses(4);
    const { actor } = await makeStaff(b.id, "ADMIN");
    const loc = await saveLocation(actor, null, { name: "الرئيسي", latitude: 24.7, longitude: 46.6, relevantText: "حياك", maxDistance: 100, active: true });
    await prisma.walletSyncJob.updateMany({ where: { businessId: b.id }, data: { status: "DONE" } });
    await saveLocation(actor, loc.id, { name: "الرئيسي", latitude: 24.71, longitude: 46.61, relevantText: "حياك مجدداً", maxDistance: 120, active: true });
    const passes = await prisma.walletPass.findMany({ where: { businessId: b.id } });
    const jobs = await prisma.walletSyncJob.findMany({ where: { businessId: b.id, status: "PENDING", kind: "PASS_UPDATE" } });
    expect(new Set(jobs.map((j) => j.walletPassId))).toEqual(new Set(passes.map((p) => p.id)));
    expect(passes).toHaveLength(4);
  });

  it("إضافة نقاط تُنشئ مهمة تحديث للبطاقة بدون تكرار المهام المعلّقة", async () => {
    const { b, customers } = await withPasses(1);
    const { actor } = await makeStaff(b.id);
    await earnForOrder(actor, { customerId: customers[0].id, externalRef: `W${uid()}`, amountHalalas: 1000, idempotencyKey: idk() });
    await earnForOrder(actor, { customerId: customers[0].id, externalRef: `W${uid()}`, amountHalalas: 1000, idempotencyKey: idk() });
    expect(await prisma.walletSyncJob.count({ where: { businessId: b.id, status: "PENDING", kind: "PASS_UPDATE" } })).toBe(1);
  });

  it("رسالة العرض: إشعار للعميل المسموح، صامت لمن أوقفها، وتحترم السقف الأسبوعي", async () => {
    const { b, customers } = await withPasses(3, { promoWeeklyCap: 1, quietStartMinute: 0, quietEndMinute: 0 });
    await prisma.customer.update({ where: { id: customers[1].id }, data: { promoOptOut: true } });
    const capped = await prisma.walletPass.findFirstOrThrow({ where: { customerId: customers[2].id } });
    await prisma.promoDelivery.create({ data: { businessId: b.id, customerId: customers[2].id, walletPassId: capped.id, message: "قديم" } });
    const { actor } = await makeStaff(b.id, "ADMIN");
    await updateSettings(actor, { offerMessage: "مشروب ثاني مجاناً اليوم" });
    expect(await prisma.walletSyncJob.count({ where: { businessId: b.id, kind: "OFFER" } })).toBe(3);
    await processDueJobs(500);
    const passes = await prisma.walletPass.findMany({ where: { businessId: b.id }, orderBy: { createdAt: "asc" } });
    const byCustomer = new Map(passes.map((p) => [p.customerId, p]));
    expect(byCustomer.get(customers[0].id)).toMatchObject({ offerText: "مشروب ثاني مجاناً اليوم", offerNotify: true });
    expect(byCustomer.get(customers[1].id)).toMatchObject({ offerNotify: false });
    expect(byCustomer.get(customers[2].id)).toMatchObject({ offerNotify: false });
    expect(await prisma.auditLog.count({ where: { businessId: b.id, action: "settings.update" } })).toBe(1);
  });

  it("لا رسائل ليلاً (23:00–08:00 الرياض): تؤجل للصباح", async () => {
    const { b } = await withPasses(1);
    const { actor } = await makeStaff(b.id, "ADMIN");
    const night = new Date("2026-05-05T21:30:00Z"); // 00:30 الرياض
    await updateSettings(actor, { offerMessage: "عرض الليل" }, night);
    const report = await processDueJobs(500, night);
    expect(report.deferred).toBeGreaterThanOrEqual(1);
    const job = await prisma.walletSyncJob.findFirstOrThrow({ where: { businessId: b.id, kind: "OFFER" } });
    expect(job.status).toBe("PENDING");
    expect(job.nextRunAt.toISOString()).toBe("2026-05-06T05:00:00.000Z"); // 08:00 الرياض
    const pass = await prisma.walletPass.findFirstOrThrow({ where: { businessId: b.id } });
    expect(pass.offerText).toBe("");
  });

  it("إعادة المحاولة تصاعدية", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(6 * 3600_000);
  });
});

describe("PassKit Web Service", () => {
  it("تسجيل الجهاز، قائمة البطاقات المحدثة، أحدث نسخة، وإلغاء التسجيل", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const pass = await ensurePass(c, "APPLE");
    const device = `dev${uid()}`;
    const auth = { authorization: `ApplePass ${pass.authToken}` };
    const p = { deviceId: device, passTypeId: PASS_TYPE, serial: pass.serial };
    const path = `/api/wallet/apple/v1/devices/${device}/registrations/${PASS_TYPE}/${pass.serial}`;

    const bad = await registerDevice(apiRequest("POST", path, { origin: null, headers: { authorization: "ApplePass wrong-token-000000" }, body: { pushToken: "abcdef0123456789abcdef" } }), params(p));
    expect(bad.status).toBe(401);

    const r1 = await registerDevice(apiRequest("POST", path, { origin: null, headers: auth, body: { pushToken: "abcdef0123456789abcdef" } }), params(p));
    expect(r1.status).toBe(201);
    const r2 = await registerDevice(apiRequest("POST", path, { origin: null, headers: auth, body: { pushToken: "abcdef0123456789abcdef" } }), params(p));
    expect(r2.status).toBe(200);

    const list = await serials(apiRequest("GET", `/api/wallet/apple/v1/devices/${device}/registrations/${PASS_TYPE}`), params({ deviceId: device, passTypeId: PASS_TYPE }));
    const body = await list.json();
    expect(body.serialNumbers).toEqual([pass.serial]);
    const none = await serials(
      apiRequest("GET", `/api/wallet/apple/v1/devices/${device}/registrations/${PASS_TYPE}?passesUpdatedSince=${body.lastUpdated}`),
      params({ deviceId: device, passTypeId: PASS_TYPE }),
    );
    expect(none.status).toBe(204);

    const latest = await latestPass(apiRequest("GET", `/api/wallet/apple/v1/passes/${PASS_TYPE}/${pass.serial}`, { headers: auth }), params({ passTypeId: PASS_TYPE, serial: pass.serial }));
    expect(latest.status).toBe(200);
    const lm = latest.headers.get("last-modified")!;
    const notModified = await latestPass(
      apiRequest("GET", `/api/wallet/apple/v1/passes/${PASS_TYPE}/${pass.serial}`, { headers: { ...auth, "if-modified-since": lm } }),
      params({ passTypeId: PASS_TYPE, serial: pass.serial }),
    );
    expect(notModified.status).toBe(304);
    const unauth = await latestPass(apiRequest("GET", `/api/wallet/apple/v1/passes/${PASS_TYPE}/${pass.serial}`), params({ passTypeId: PASS_TYPE, serial: pass.serial }));
    expect(unauth.status).toBe(401);

    const del = await unregisterDevice(apiRequest("DELETE", path, { origin: null, headers: auth }), params(p));
    expect(del.status).toBe(200);
    expect(await prisma.deviceRegistration.count({ where: { walletPassId: pass.id } })).toBe(0);
  });
});
