import { describe, expect, it } from "vitest";
import { GET as designGet, PUT as designPut } from "@/app/api/admin/design/route";
import { POST as publishRoute } from "@/app/api/admin/design/publish/route";
import { GET as mediaGet } from "@/app/media/[id]/route";
import { prisma } from "@/lib/db";
import {
  applyTemplate,
  contrast,
  cssVars,
  DEFAULT_DESIGN,
  DesignSchema,
  fillText,
  parseDesign,
  TEMPLATE_IDS,
  TEMPLATES,
  type Design,
} from "@/modules/design/config";
import { getDesignState, getPublishedDesign, publishDraft, saveDraft, sniffImage, uploadAsset } from "@/modules/design/service";
import { apiRequest, makeBusiness, makeStaff } from "./helpers";

// PNG حقيقي 16×16 (أصغر أبعاد مسموحة)
function png(w = 16, h = 16, seed = 0): Buffer {
  const head = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const dims = Buffer.alloc(8);
  dims.writeUInt32BE(w, 0);
  dims.writeUInt32BE(h, 4);
  return Buffer.concat([head, dims, Buffer.from([8, 6, 0, 0, 0, seed, 0, 0, 0, 0])]);
}

describe("إعدادات التصميم", () => {
  it("كل القوالب صالحة ومختلفة في التخطيط والزخرفة وليس اللون فقط", () => {
    const layouts = new Set<string>();
    const decors = new Set<string>();
    for (const id of TEMPLATE_IDS) {
      const d = applyTemplate(id);
      expect(DesignSchema.safeParse(d).success).toBe(true);
      layouts.add(d.layout);
      decors.add(d.decor);
      // تباين نص القالب مع خلفيته مقروء (WCAG AA)
      expect(contrast(TEMPLATES[id].colors.text, TEMPLATES[id].colors.bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(layouts.size).toBe(TEMPLATE_IDS.length);
    expect(decors.size).toBe(6);
  });

  it("يرفض لوناً غير HEX (منع حقن CSS)", () => {
    const bad = { ...DEFAULT_DESIGN, colors: { ...DEFAULT_DESIGN.colors, bg: "red;}body{display:none" } };
    expect(DesignSchema.safeParse(bad).success).toBe(false);
    for (const v of Object.values(cssVars(DEFAULT_DESIGN))) expect(v).toMatch(/^(#[0-9a-f]{6}|\d+(\.\d+)?(px)?|var\(--font-[a-z]+\))$/i);
  });

  it("سلايد الأختام وQR أساسي: لا يُحذف ولا يُعطّل ولا يتحرك من الأول", () => {
    const noStamps = { ...DEFAULT_DESIGN, slides: DEFAULT_DESIGN.slides.filter((s) => s.kind !== "stamps") };
    const disabled = { ...DEFAULT_DESIGN, slides: DEFAULT_DESIGN.slides.map((s) => (s.kind === "stamps" ? { ...s, enabled: false } : s)) };
    const moved = { ...DEFAULT_DESIGN, slides: [...DEFAULT_DESIGN.slides].reverse() };
    for (const d of [noStamps, disabled, moved]) expect(DesignSchema.safeParse(d).success).toBe(false);
  });

  it("تصميم تالف في قاعدة البيانات يرجع للافتراضي بدل كسر صفحة العميل", () => {
    expect(parseDesign({ template: "royal" })).toEqual(DEFAULT_DESIGN);
    expect(parseDesign(null)).toEqual(DEFAULT_DESIGN);
  });

  it("النصوص تُملأ كنص عادي", () => {
    expect(fillText("باقي {remaining} من {goal} يا {name}", { remaining: 2, goal: 5, balance: 3, name: "<b>سارة</b>" })).toBe("باقي 2 من 5 يا <b>سارة</b>");
  });
});

describe("المسودة والنشر", () => {
  it("الحفظ يغيّر المسودة فقط، والعملاء يرون المنشور حتى النشر", async () => {
    const b = await makeBusiness();
    const { actor } = await makeStaff(b.id, "ADMIN");
    expect(await getPublishedDesign(b.id)).toEqual(DEFAULT_DESIGN);

    const night = applyTemplate("night");
    const s1 = await saveDraft(actor, night);
    expect(s1.draft.template).toBe("night");
    expect(s1.dirty).toBe(true);
    expect((await getPublishedDesign(b.id)).template).toBe("royal");

    const s2 = await publishDraft(actor, s1.draftVersion);
    expect(s2.dirty).toBe(false);
    expect((await getPublishedDesign(b.id)).template).toBe("night");
    expect(await prisma.auditLog.count({ where: { businessId: b.id, action: "design.publish" } })).toBe(1);
  });

  it("لا يُنشر إصدار غير الذي راجعه المدير", async () => {
    const b = await makeBusiness();
    const { actor } = await makeStaff(b.id, "ADMIN");
    const s1 = await saveDraft(actor, applyTemplate("glass"));
    await saveDraft(actor, applyTemplate("minimal"));
    await expect(publishDraft(actor, s1.draftVersion)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await getPublishedDesign(b.id)).template).toBe("royal");
  });

  it("لا يمكن استخدام صورة تخص محلاً آخر", async () => {
    const a = await makeBusiness();
    const other = await makeBusiness();
    const { actor: adminA } = await makeStaff(a.id, "ADMIN");
    const { actor: adminB } = await makeStaff(other.id, "ADMIN");
    const asset = await uploadAsset(adminB, "logo", png(64, 64, 1));
    const d: Design = { ...applyTemplate("royal"), logoAssetId: asset.id };
    await expect(saveDraft(adminA, d)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const own = await uploadAsset(adminA, "logo", png(64, 64, 2));
    const ok = await saveDraft(adminA, { ...d, logoAssetId: own.id });
    expect(ok.draft.logoAssetId).toBe(own.id);
  });

  it("الصلاحيات: الكاشير والمدير لا يعدّلان التصميم، والأدمن فقط", async () => {
    const b = await makeBusiness();
    const { token: cashier } = await makeStaff(b.id, "CASHIER");
    const { token: manager } = await makeStaff(b.id, "MANAGER");
    const { token: admin } = await makeStaff(b.id, "ADMIN");
    const body = { design: applyTemplate("nature") };
    expect((await designPut(apiRequest("PUT", "/api/admin/design", { token: cashier, body }))).status).toBe(403);
    expect((await designPut(apiRequest("PUT", "/api/admin/design", { token: manager, body }))).status).toBe(403);
    expect((await designPut(apiRequest("PUT", "/api/admin/design", { body }))).status).toBe(401);
    const res = await designPut(apiRequest("PUT", "/api/admin/design", { token: admin, body }));
    expect(res.status).toBe(200);
    const state = await (await designGet(apiRequest("GET", "/api/admin/design", { token: admin }))).json();
    expect(state.data.draft.template).toBe("nature");
    const pub = await publishRoute(apiRequest("POST", "/api/admin/design/publish", { token: admin, body: { draftVersion: state.data.draftVersion } }));
    expect(pub.status).toBe(400); // يتطلب confirm: true
    expect((await getDesignState(b.id)).published.template).toBe("royal");
  });
});

describe("رفع الصور", () => {
  it("يتعرف على PNG وJPEG وWebP من المحتوى ويرفض SVG وHTML", () => {
    expect(sniffImage(png(40, 30))).toEqual({ mime: "image/png", width: 40, height: 30 });
    const jpeg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffc0001108002000400301220002110103110100", "hex");
    expect(sniffImage(jpeg)).toEqual({ mime: "image/jpeg", width: 64, height: 32 });
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0);
    webp.write("WEBP", 8);
    webp.write("VP8X", 12);
    webp.writeUIntLE(99, 24, 3);
    webp.writeUIntLE(49, 27, 3);
    expect(sniffImage(webp)).toEqual({ mime: "image/webp", width: 100, height: 50 });
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
  });

  it("يرفض الملفات الكبيرة والأبعاد غير المعقولة ويمنع التكرار", async () => {
    const b = await makeBusiness();
    const { actor } = await makeStaff(b.id, "ADMIN");
    await expect(uploadAsset(actor, "logo", Buffer.concat([png(), Buffer.alloc(1_600_000)]))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(uploadAsset(actor, "logo", png(8, 8))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(uploadAsset(actor, "logo", png(9000, 100))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(uploadAsset(actor, "script", png())).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const a1 = await uploadAsset(actor, "stamp", png(32, 32, 9));
    const a2 = await uploadAsset(actor, "stamp", png(32, 32, 9));
    expect(a2.id).toBe(a1.id);
  });

  it("الصورة تُخدم بنوعها الحقيقي مع nosniff وsandbox", async () => {
    const b = await makeBusiness();
    const { actor } = await makeStaff(b.id, "ADMIN");
    const a = await uploadAsset(actor, "slide", png(20, 20, 3));
    const res = await mediaGet(new Request(`http://localhost/media/${a.id}`), { params: Promise.resolve({ id: a.id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    const missing = await mediaGet(new Request("http://localhost/media/../../etc"), { params: Promise.resolve({ id: "../../etc" }) });
    expect(missing.status).toBe(404);
  });
});
