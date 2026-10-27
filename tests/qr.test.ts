import { describe, expect, it } from "vitest";
import { issueQrToken, verifyQrToken } from "@/modules/qr";
import { maskPhone, normalizePhone } from "@/lib/phone";
import { POST as lookupRoute } from "@/app/api/cashier/lookup/route";
import { GET as qrRoute } from "@/app/api/card/[id]/qr/route";
import { cardKey } from "@/modules/customers";
import { apiRequest, json, makeBusiness, makeCustomer, makeStaff, params } from "./helpers";

describe("QR البطاقة", () => {
  it("توكن موقّع لا يحتوي رقم الجوال", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const token = issueQrToken(c.id, 60);
    expect(token).not.toContain(c.phone.slice(-9));
    expect(token).not.toContain(c.phone);
    const v = verifyQrToken(token);
    expect(v).toMatchObject({ ok: true, customerId: c.id });
  });

  it("قصير العمر: ينتهي بعد المدة", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const token = issueQrToken("cabcdefghij1234567890", 90, now);
    expect(verifyQrToken(token, new Date(now.getTime() + 60_000)).ok).toBe(true);
    expect(verifyQrToken(token, new Date(now.getTime() + 91_000))).toEqual({ ok: false, reason: "expired" });
  });

  it("أي تعديل على التوكن يبطله", () => {
    const token = issueQrToken("cabcdefghij1234567890", 90);
    const parts = token.split(".");
    expect(verifyQrToken([parts[0], "cOTHERCUSTOMER00000000", parts[2], parts[3]].join(".")).ok).toBe(false);
    expect(verifyQrToken([parts[0], parts[1], "zzzzzz", parts[3]].join(".")).ok).toBe(false);
    expect(verifyQrToken(token.slice(0, -2) + "AA").ok).toBe(false);
    expect(verifyQrToken("+966512345678").ok).toBe(false);
  });

  it("صفحة العميل تصدر QR جديداً يتجدد", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const res = await qrRoute(apiRequest("GET", `/api/card/${c.id}/qr?k=${cardKey(c)}`), params({ id: c.id }));
    const body = await json(res);
    expect(body.data.svg).toContain("<svg");
    expect(body.data.expiresInSeconds).toBeLessThanOrEqual(120);
  });

  it("الكاشير يرى الجوال مقنّعاً ولا يرى أي رمز تحقق", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { token } = await makeStaff(b.id);
    const res = await lookupRoute(apiRequest("POST", "/api/cashier/lookup", { token, body: { qr: issueQrToken(c.id, 60) } }));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(c.phone);
    expect(text).not.toContain(c.phone.slice(4));
    expect(text).not.toMatch(/referralCode|cardKey|authToken|code"/);
    expect(JSON.parse(text).data.maskedPhone).toBe(maskPhone(c.phone));
  });

  it("QR منتهي يُرفض عند الكاشير", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { token } = await makeStaff(b.id);
    const old = issueQrToken(c.id, 10, new Date(Date.now() - 60_000));
    const res = await lookupRoute(apiRequest("POST", "/api/cashier/lookup", { token, body: { qr: old } }));
    expect(res.status).toBe(422);
    expect((await json(res)).error?.code).toBe("QR_EXPIRED");
  });

  it("تطبيع وتقنيع أرقام الجوال", () => {
    expect(normalizePhone("0512345678")).toBe("+966512345678");
    expect(normalizePhone("٠٥١٢٣٤٥٦٧٨")).toBe("+966512345678");
    expect(normalizePhone("+966 51 234 5678")).toBe("+966512345678");
    expect(normalizePhone("0412345678")).toBeNull();
    expect(maskPhone("+966512345678")).toBe("05••••••78");
  });
});
