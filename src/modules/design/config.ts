import { z } from "zod";

// إعدادات تصميم بطاقة الولاء. الملف مشترك بين السيرفر والمتصفح (بدون أي استيراد خاص بالسيرفر).
// كل القيم التي تصل إلى CSS تمر من هنا: ألوان HEX فقط وأرقام محدودة، فلا يمكن حقن CSS.

export const TEMPLATE_IDS = ["royal", "classic", "night", "nature", "glass", "minimal", "cups"] as const;
export const LAYOUTS = ["framed", "ticket", "arc", "grid", "glass", "minimal", "cups"] as const;
export const DECORS = ["ornament", "perforation", "crescent", "leaves", "blobs", "none"] as const;
export const FONTS = ["plex", "tajawal", "kufi", "amiri"] as const;
export const STAMP_STYLES = ["photo", "3d", "flat", "line", "crescent", "star", "seal", "takeaway", "custom"] as const;
export const STAMP_SHAPES = ["circle", "rounded", "square", "none"] as const;
export const SLIDE_KINDS = ["stamps", "reward", "offer", "custom"] as const;
export const COLOR_KEYS = ["bg", "bg2", "text", "muted", "accent", "stampFill", "stampEmpty", "border"] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];
export type Layout = (typeof LAYOUTS)[number];
export type Decor = (typeof DECORS)[number];
export type FontId = (typeof FONTS)[number];
export type StampStyle = (typeof STAMP_STYLES)[number];
export type ColorKey = (typeof COLOR_KEYS)[number];

export const MAX_SLIDES = 8;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "لون HEX غير صالح");
const assetId = z.string().regex(/^[a-z0-9]{20,32}$/).nullable();
const text = (max: number) => z.string().trim().max(max);

export const ColorsSchema = z.object(Object.fromEntries(COLOR_KEYS.map((k) => [k, hex])) as Record<ColorKey, typeof hex>).strict();
export type Colors = z.infer<typeof ColorsSchema>;

export const SlideSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,24}$/),
    kind: z.enum(SLIDE_KINDS),
    enabled: z.boolean(),
    title: text(50),
    body: text(160),
    imageAssetId: assetId,
    /** null = نفس قالب البطاقة */
    template: z.enum(TEMPLATE_IDS).nullable(),
  })
  .strict();
export type Slide = z.infer<typeof SlideSchema>;

export const DesignSchema = z
  .object({
    template: z.enum(TEMPLATE_IDS),
    layout: z.enum(LAYOUTS),
    decor: z.enum(DECORS),
    font: z.enum(FONTS),
    colors: ColorsSchema,
    radius: z.number().int().min(8).max(36),
    logoAssetId: assetId,
    background: z.object({ assetId, opacity: z.number().int().min(0).max(100) }).strict(),
    stamp: z
      .object({
        style: z.enum(STAMP_STYLES),
        shape: z.enum(STAMP_SHAPES),
        size: z.number().int().min(28).max(80),
        gap: z.number().int().min(4).max(24),
        custom: z.object({ empty: assetId, filled: assetId, reward: assetId }).strict(),
      })
      .strict(),
    texts: z
      .object({
        title: text(40),
        subtitle: text(60),
        progress: text(80),
        rewardReady: text(80),
        qrHint: text(40),
      })
      .strict(),
    effects: z
      .object({ entrance: z.boolean(), fill: z.boolean(), celebrate: z.boolean(), shine: z.boolean() })
      .strict(),
    slides: z.array(SlideSchema).min(1).max(MAX_SLIDES),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    for (const s of d.slides) {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: "معرّف سلايد مكرر", path: ["slides"] });
      ids.add(s.id);
    }
    const stamps = d.slides.filter((s) => s.kind === "stamps");
    if (stamps.length !== 1 || d.slides[0].kind !== "stamps" || !d.slides[0].enabled) {
      ctx.addIssue({ code: "custom", message: "سلايد الأختام وQR أساسي ويجب أن يبقى أولاً ومفعّلاً", path: ["slides"] });
    }
  });
export type Design = z.infer<typeof DesignSchema>;

export const TEMPLATE_LABELS: Record<TemplateId, { name: string; hint: string }> = {
  royal: { name: "Qamra Royal", hint: "عنابي وذهبي فاخر بإطار مزخرف" },
  classic: { name: "Qamra Classic", hint: "كريمي وبني دافئ بشكل تذكرة" },
  night: { name: "Qamra Night", hint: "كحلي وذهبي مع هلال وأختام على قوس" },
  nature: { name: "Qamra Nature", hint: "أخضر هادئ بلمسات أوراق" },
  glass: { name: "Qamra Glass", hint: "زجاجي شفاف فوق ألوان متدرجة" },
  minimal: { name: "Qamra Minimal", hint: "أبيض نظيف وعداد كبير" },
  cups: { name: "Qamra Cups", hint: "بيج هادئ وصف أكواب سفري: كوب قمرا لكل ختم" },
};

export const LAYOUT_LABELS: Record<Layout, string> = {
  framed: "إطار ملكي",
  ticket: "تذكرة",
  arc: "قوس",
  grid: "شبكة",
  glass: "زجاجي",
  minimal: "بسيط بعداد",
  cups: "صف أكواب",
};
export const DECOR_LABELS: Record<Decor, string> = {
  ornament: "زخرفة ذهبية",
  perforation: "تخريم تذكرة",
  crescent: "هلال ونجوم",
  leaves: "أوراق نباتية",
  blobs: "ألوان متدرجة",
  none: "بدون",
};
export const FONT_LABELS: Record<FontId, string> = {
  plex: "IBM Plex عربي",
  tajawal: "تجوّل",
  kufi: "ريم كوفي",
  amiri: "أميري",
};
export const STAMP_STYLE_LABELS: Record<StampStyle, string> = {
  photo: "كوب واقعي (PNG)",
  "3d": "كوب ثلاثي الأبعاد",
  flat: "كوب مسطح",
  line: "أيقونة خطية",
  crescent: "هلال",
  star: "نجمة ثمانية",
  seal: "ختم دائري",
  takeaway: "كوب سفري قمرا (PNG)",
  custom: "صوري المرفوعة",
};
export const SHAPE_LABELS: Record<(typeof STAMP_SHAPES)[number], string> = {
  circle: "دائرة",
  rounded: "مربع بزوايا ناعمة",
  square: "مربع",
  none: "بدون إطار",
};
export const COLOR_LABELS: Record<ColorKey, string> = {
  bg: "الخلفية",
  bg2: "الخلفية الثانية (التدرج)",
  text: "النصوص",
  muted: "النصوص الثانوية",
  accent: "لون التمييز",
  stampFill: "الختم المكتمل",
  stampEmpty: "الختم الفارغ",
  border: "الإطارات",
};

interface TemplateDef {
  layout: Layout;
  decor: Decor;
  font: FontId;
  radius: number;
  colors: Colors;
  stamp: { style: StampStyle; shape: Design["stamp"]["shape"]; size: number; gap: number };
}

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  royal: {
    layout: "framed",
    decor: "ornament",
    font: "kufi",
    radius: 24,
    colors: {
      bg: "#6a1e2e",
      bg2: "#2c0912",
      text: "#f8eedc",
      muted: "#dcc49c",
      accent: "#d2ad62",
      stampFill: "#d2ad62",
      stampEmpty: "#8a4352",
      border: "#d2ad62",
    },
    stamp: { style: "3d", shape: "circle", size: 56, gap: 10 },
  },
  classic: {
    layout: "ticket",
    decor: "perforation",
    font: "amiri",
    radius: 18,
    colors: {
      bg: "#f6ead6",
      bg2: "#e9d4b2",
      text: "#3a2315",
      muted: "#7b5a40",
      accent: "#8b5a33",
      stampFill: "#6c3d20",
      stampEmpty: "#d9c19c",
      border: "#b48b5f",
    },
    stamp: { style: "photo", shape: "circle", size: 58, gap: 8 },
  },
  night: {
    layout: "arc",
    decor: "crescent",
    font: "plex",
    radius: 28,
    colors: {
      bg: "#13214a",
      bg2: "#060c1f",
      text: "#f4ecda",
      muted: "#aab4cc",
      accent: "#d9b461",
      stampFill: "#d9b461",
      stampEmpty: "#2a3b68",
      border: "#33467a",
    },
    stamp: { style: "crescent", shape: "circle", size: 50, gap: 8 },
  },
  nature: {
    layout: "grid",
    decor: "leaves",
    font: "tajawal",
    radius: 30,
    colors: {
      bg: "#30513f",
      bg2: "#19301f",
      text: "#f3f0e3",
      muted: "#c2d0bb",
      accent: "#c3dc9f",
      stampFill: "#eee7cb",
      stampEmpty: "#4a6d58",
      border: "#7d9d80",
    },
    stamp: { style: "line", shape: "rounded", size: 60, gap: 12 },
  },
  glass: {
    layout: "glass",
    decor: "blobs",
    font: "plex",
    radius: 32,
    colors: {
      bg: "#7b2d6b",
      bg2: "#1d3d7a",
      text: "#ffffff",
      muted: "#e7def5",
      accent: "#ffd29c",
      stampFill: "#ffffff",
      stampEmpty: "#c9bde0",
      border: "#ffffff",
    },
    stamp: { style: "flat", shape: "circle", size: 56, gap: 10 },
  },
  minimal: {
    layout: "minimal",
    decor: "none",
    font: "plex",
    radius: 20,
    colors: {
      bg: "#ffffff",
      bg2: "#f5f2ee",
      text: "#1e1b18",
      muted: "#6f6962",
      accent: "#5c1a28",
      stampFill: "#5c1a28",
      stampEmpty: "#e6e1db",
      border: "#e8e3dd",
    },
    stamp: { style: "line", shape: "none", size: 48, gap: 6 },
  },
  cups: {
    layout: "cups",
    decor: "none",
    font: "plex",
    radius: 18,
    colors: {
      bg: "#ebe2d0",
      bg2: "#e4d8c2",
      text: "#3b1520",
      muted: "#6d4b40",
      accent: "#5c1a28",
      stampFill: "#5c1a28",
      stampEmpty: "#ffffff",
      border: "#d3c3a6",
    },
    stamp: { style: "takeaway", shape: "none", size: 52, gap: 4 },
  },
};

export const DEFAULT_TEXTS: Design["texts"] = {
  title: "شاهي قمرا",
  subtitle: "بطاقة الولاء",
  progress: "باقي {remaining} وكوبك مجاني",
  rewardReady: "كوبك المجاني جاهز، اطلبه من الكاشير",
  qrHint: "امسح عند الكاشير",
};

export function defaultSlides(): Slide[] {
  return [
    { id: "stamps", kind: "stamps", enabled: true, title: "", body: "", imageAssetId: null, template: null },
    {
      id: "reward",
      kind: "reward",
      enabled: true,
      title: "مكافأتك",
      body: "عند اكتمال الأختام اطلب مكافأتك من الكاشير وأظهر له QR بطاقتك.",
      imageAssetId: null,
      template: null,
    },
    {
      id: "offer",
      kind: "offer",
      enabled: true,
      title: "ساعة قمرا",
      body: "أختام مضاعفة من الأحد إلى الأربعاء، 3 إلى 6 العصر.",
      imageAssetId: null,
      template: null,
    },
  ];
}

/** تصميم كامل من قالب جاهز (مع الإبقاء على النصوص والصور والسلايدات إن وُجدت) */
export function applyTemplate(id: TemplateId, base?: Design): Design {
  const t = TEMPLATES[id];
  return {
    template: id,
    layout: t.layout,
    decor: t.decor,
    font: t.font,
    colors: { ...t.colors },
    radius: t.radius,
    logoAssetId: base?.logoAssetId ?? null,
    background: base?.background ?? { assetId: null, opacity: 30 },
    stamp: { ...t.stamp, custom: base?.stamp.custom ?? { empty: null, filled: null, reward: null } },
    texts: base?.texts ?? { ...DEFAULT_TEXTS },
    effects: base?.effects ?? { entrance: true, fill: true, celebrate: true, shine: true },
    slides: base?.slides ?? defaultSlides(),
  };
}

export const DEFAULT_DESIGN: Design = applyTemplate("royal");

/** يقرأ تصميماً مخزّناً بأمان؛ أي قيمة تالفة ترجع للافتراضي بدل كسر صفحة العميل */
export function parseDesign(raw: unknown): Design {
  const r = DesignSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_DESIGN;
}

/** يستبدل {remaining} {goal} {balance} {name} في النصوص (نص عادي فقط، بلا HTML) */
export function fillText(tpl: string, v: { remaining: number; goal: number; balance: number; name: string }): string {
  return tpl.replace(/\{(remaining|goal|balance|name)\}/g, (_, k: keyof typeof v) => String(v[k]));
}

/** معرّفات الصور المستخدمة في التصميم (للتحقق أنها تخص المحل نفسه) */
export function assetIdsOf(d: Design): string[] {
  const ids = [
    d.logoAssetId,
    d.background.assetId,
    d.stamp.custom.empty,
    d.stamp.custom.filled,
    d.stamp.custom.reward,
    ...d.slides.map((s) => s.imageAssetId),
  ];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

// ---- الألوان والتباين (WCAG) ----

function lum(h: string): number {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** ألوان القالب المستخدم لسلايد معيّن */
export function slideColors(d: Design, s: Slide): Colors {
  return s.template && s.template !== d.template ? TEMPLATES[s.template].colors : d.colors;
}

/** متغيرات CSS للبطاقة. كل القيم إما HEX تم التحقق منه أو أرقام. */
export function cssVars(d: Design, colors: Colors = d.colors): Record<string, string> {
  return {
    "--qc-bg": colors.bg,
    "--qc-bg2": colors.bg2,
    "--qc-text": colors.text,
    "--qc-muted": colors.muted,
    "--qc-accent": colors.accent,
    "--qc-fill": colors.stampFill,
    "--qc-empty": colors.stampEmpty,
    "--qc-border": colors.border,
    "--qc-radius": `${d.radius}px`,
    "--qc-stamp": `${d.stamp.size}px`,
    "--qc-gap": `${d.stamp.gap}px`,
    "--qc-bg-opacity": String(d.background.opacity / 100),
    "--qc-font": `var(--font-${d.font})`,
  };
}

export function cssBlock(selector: string, vars: Record<string, string>): string {
  return `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}
