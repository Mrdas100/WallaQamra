import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "@/lib/security-headers";
import { POST as earnRoute } from "@/app/api/cashier/earn/route";
import { POST as registerRoute } from "@/app/api/customers/register/route";
import { GET as settingsGet, PATCH as settingsPatch } from "@/app/api/admin/settings/route";
import { POST as adjustRoute } from "@/app/api/manager/adjust/route";
import { prisma } from "@/lib/db";
import { hit } from "@/lib/ratelimit";
import { apiRequest, idk, makeBusiness, makeCustomer, makeStaff } from "./helpers";

describe("CSP وCache-Control", () => {
  it("CSP صارم بدون unsafe-inline للسكربتات في الإنتاج", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });

  it("no-store على صفحات الإدارة والكاشير وصفحة البطاقة", () => {
    for (const p of ["/admin", "/admin/settings", "/cashier", "/c/abc", "/api/admin/settings", "/login"]) {
      expect(securityHeaders(p, "x", true)["cache-control"]).toBe("no-store, max-age=0");
    }
    expect(securityHeaders("/", "x", true)["cache-control"]).toBeUndefined();
    const h = securityHeaders("/", "x", true);
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["permissions-policy"]).toContain("geolocation=()");
    expect(h["strict-transport-security"]).toBeDefined();
  });

  it("ردود الـ API تحمل no-store", async () => {
    const b = await makeBusiness();
    const { token } = await makeStaff(b.id, "ADMIN");
    const res = await settingsGet(apiRequest("GET", "/api/admin/settings", { token }));
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

describe("الأدوار والتحقق في السيرفر", () => {
  it("بدون جلسة: 401", async () => {
    const res = await earnRoute(apiRequest("POST", "/api/cashier/earn", { body: {} }));
    expect(res.status).toBe(401);
  });

  it("الكاشير لا يصل لإعدادات الأدمن ولا للإضافة اليدوية", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { token } = await makeStaff(b.id, "CASHIER");
    expect((await settingsGet(apiRequest("GET", "/api/admin/settings", { token }))).status).toBe(403);
    expect((await settingsPatch(apiRequest("PATCH", "/api/admin/settings", { token, body: { pointsPerSar: 50 } }))).status).toBe(403);
    const adj = await adjustRoute(
      apiRequest("POST", "/api/manager/adjust", { token, body: { customerId: c.id, points: 50, reason: "هدية للعميل", idempotencyKey: idk() } }),
    );
    expect(adj.status).toBe(403);
    expect(await prisma.ledgerEntry.count({ where: { customerId: c.id } })).toBe(0);
  });

  it("المدير لا يغيّر الإعدادات (للأدمن فقط)", async () => {
    const b = await makeBusiness();
    const { token } = await makeStaff(b.id, "MANAGER");
    expect((await settingsPatch(apiRequest("PATCH", "/api/admin/settings", { token, body: { pointsPerSar: 50 } }))).status).toBe(403);
  });

  it("جلسة موظف معطّل لا تعمل", async () => {
    const b = await makeBusiness();
    const { token, staff } = await makeStaff(b.id, "ADMIN");
    await prisma.staff.update({ where: { id: staff.id }, data: { active: false } });
    expect((await settingsGet(apiRequest("GET", "/api/admin/settings", { token }))).status).toBe(401);
  });

  it("CSRF: طلب معدِّل من أصل آخر مرفوض", async () => {
    const b = await makeBusiness();
    const c = await makeCustomer(b.id);
    const { token } = await makeStaff(b.id);
    const res = await earnRoute(
      apiRequest("POST", "/api/cashier/earn", {
        token,
        origin: "https://evil.example",
        body: { customerId: c.id, externalRef: "X1", amount: "10", idempotencyKey: idk() },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("Rate limiting", () => {
  it("تسجيل العملاء: 5 طلبات لكل 10 دقائق لكل IP", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await registerRoute(apiRequest("POST", "/api/customers/register", { ip, body: { name: "x", phone: "bad" } }));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 400)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("كل الـ API تمر بحد عام لكل IP", async () => {
    const key = `api:test-${idk()}`;
    for (let i = 1; i <= 3; i++) expect(await hit(key, 60)).toBe(i);
  });
});

describe("رمز تسجيل العملاء", () => {
  it("يشير إلى الصفحة الرئيسية للموقع ولا يحوي بيانات عميل", async () => {
    const { signupUrl, signupQrSvg } = await import("@/modules/signup");
    expect(signupUrl()).toBe("https://loyalty.test/");
    const svg = await signupQrSvg();
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
