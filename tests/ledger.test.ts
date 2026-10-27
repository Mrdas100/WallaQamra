import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBalance } from "@/modules/ledger";
import { correctEntry } from "@/modules/manual";
import { credit, makeBusiness, makeCustomer, makeStaff } from "./helpers";

describe("ledger: الرصيد = مجموع الحركات (إضافة فقط)", () => {
  it("لا يوجد أي حقل رصيد قابل للتعديل في العميل أو البطاقة", () => {
    const customerFields = Object.keys(Prisma.CustomerScalarFieldEnum);
    const passFields = Object.keys(Prisma.WalletPassScalarFieldEnum);
    for (const f of [...customerFields, ...passFields]) expect(f.toLowerCase()).not.toMatch(/balance|points/);
  });

  it("الرصيد يُحسب من مجموع الحركات", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    await credit(b.id, c.id, 50);
    await credit(b.id, c.id, 30);
    await credit(b.id, c.id, -20);
    expect(await getBalance(c.id, "POINT")).toBe(60);
  });

  it("trigger يمنع UPDATE على الحركات (حتى عبر SQL مباشر)", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const e = await credit(b.id, c.id, 10);
    await expect(prisma.ledgerEntry.update({ where: { id: e.id }, data: { points: 9999 } })).rejects.toThrow(/APPEND_ONLY/);
    await expect(prisma.$executeRawUnsafe(`UPDATE "LedgerEntry" SET points = 5 WHERE id = '${e.id}'`)).rejects.toThrow(/APPEND_ONLY/);
    expect(await getBalance(c.id, "POINT")).toBe(10);
  });

  it("trigger يمنع DELETE وTRUNCATE على الحركات", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const e = await credit(b.id, c.id, 10);
    await expect(prisma.ledgerEntry.delete({ where: { id: e.id } })).rejects.toThrow(/APPEND_ONLY/);
    await expect(prisma.ledgerEntry.deleteMany({ where: { customerId: c.id } })).rejects.toThrow(/APPEND_ONLY/);
    await expect(prisma.$executeRawUnsafe(`TRUNCATE "LedgerEntry" CASCADE`)).rejects.toThrow(/APPEND_ONLY/);
    expect(await prisma.ledgerEntry.count({ where: { customerId: c.id } })).toBe(1);
  });

  it("AuditLog وRedemption محميان أيضاً من التعديل والحذف", async () => {
    const b = await makeBusiness();
    const log = await prisma.auditLog.create({ data: { businessId: b.id, action: "x", entity: "y" } });
    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { action: "z" } })).rejects.toThrow(/APPEND_ONLY/);
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/APPEND_ONLY/);
  });

  it("الحركة اليدوية أو التصحيح بدون سبب مرفوضة من قاعدة البيانات نفسها", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    await expect(credit(b.id, c.id, 10, { reason: null })).rejects.toThrow();
    await expect(credit(b.id, c.id, 10, { type: "CORRECTION", reason: " " })).rejects.toThrow();
    await expect(credit(b.id, c.id, 0, { type: "EARN" })).rejects.toThrow();
  });

  it("التصحيح بحركة عكسية مع سبب، ولا يمكن عكس نفس الحركة مرتين", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { actor } = await makeStaff(b.id, "MANAGER");
    const e = await credit(b.id, c.id, 40);
    const rev = await correctEntry(actor, { entryId: e.id, reason: "إضافة بالخطأ" });
    expect(rev.points).toBe(-40);
    expect(rev.reversesEntryId).toBe(e.id);
    expect(rev.reason).toBe("إضافة بالخطأ");
    expect(await getBalance(c.id, "POINT")).toBe(0);
    await expect(correctEntry(actor, { entryId: e.id, reason: "مرة ثانية" })).rejects.toMatchObject({ code: "CONFLICT" });
    // الحركة الأصلية باقية كما هي
    expect((await prisma.ledgerEntry.findUnique({ where: { id: e.id } }))?.points).toBe(40);
  });

  it("التصحيح يحتاج سبباً وصلاحية مدير", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const e = await credit(b.id, c.id, 40);
    const { actor: manager } = await makeStaff(b.id, "MANAGER");
    const { actor: cashier } = await makeStaff(b.id, "CASHIER");
    await expect(correctEntry(manager, { entryId: e.id, reason: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(correctEntry(cashier, { entryId: e.id, reason: "سبب كافٍ" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
