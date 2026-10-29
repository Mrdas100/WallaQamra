import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement, isValidElement, type ReactNode } from "react";
import type { Design } from "@/modules/design/config";
import { getAssetFile } from "@/modules/design/service";
import { StampArt, type StampState } from "@/ui/card/stamp-art";
import { STAMP_STRIP_MAX, STAMP_STRIP_MIN } from "./stamps";

// صور بطاقة المحفظة من التصميم المنشور في لوحة الإدارة: شريط الأختام والشعار والألوان.
// الأختام نفسها هي نفس رسومات البطاقة في الموقع (stamp-art)، تُحوَّل إلى PNG بـ sharp.

/** مقاس شريط storeCard في Apple (نقاط). أي ارتفاع أقل يجعل iOS يمطّه ويقص الأطراف. */
export const STRIP_W = 375;
export const STRIP_H = 144;

/** بصمة التصميم: تتغير مع أي تعديل منشور، فتُستخدم في روابط الصور وفي التخزين المؤقت */
export function designHash(d: Design): string {
  return createHash("sha256").update(JSON.stringify(d)).digest("hex").slice(0, 12);
}

const rgb = (h: string) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;

/** ألوان Apple Wallet من ألوان القالب */
export function passColors(d: Design) {
  return { backgroundColor: rgb(d.colors.bg), foregroundColor: rgb(d.colors.text), labelColor: rgb(d.colors.muted) };
}

export function stripInRange(goal: number, filled: number): boolean {
  return Number.isInteger(goal) && Number.isInteger(filled) && goal >= STAMP_STRIP_MIN && goal <= STAMP_STRIP_MAX && filled >= 0 && filled <= goal;
}

// ---- تخزين مؤقت محدود (عدد التركيبات محدود أصلاً: تصميم × عدد أكواب × رصيد × مقاس) ----
const MAX_CACHE = 400;
const cache = new Map<string, Promise<Buffer>>();
function cached(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
  const hit = cache.get(key);
  if (hit) return hit;
  const p = make();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return p;
}

async function sharp() {
  return (await import("sharp")).default;
}

const dataUri = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString("base64")}`;

async function libraryImage(state: StampState, set: "photo" | "takeaway" = "photo"): Promise<string> {
  const b = await readFile(path.join(process.cwd(), "public", "library", `${set}-${state}.png`));
  return dataUri("image/png", b);
}

async function assetImage(id: string | null): Promise<string | null> {
  if (!id) return null;
  const a = await getAssetFile(id);
  return a ? dataUri(a.mime, Buffer.from(a.data)) : null;
}

// Next يمنع react-dom/server في كود السيرفر، ورسومات الأختام عناصر SVG بسيطة،
// فنحوّلها لنص بأنفسنا: نستدعي المكوّنات ونكتب الوسوم مع تحويل أسماء الخصائص لصيغة SVG.
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const KEEP = new Set(["viewBox", "preserveAspectRatio"]);
const attrName = (k: string) => (k === "className" ? "class" : KEEP.has(k) ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

function toSvg(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return esc(String(node));
  if (Array.isArray(node)) return node.map(toSvg).join("");
  if (!isValidElement(node)) return "";
  const { children, ...props } = node.props as Record<string, unknown> & { children?: ReactNode };
  if (typeof node.type === "function") return toSvg((node.type as (p: unknown) => ReactNode)(node.props));
  if (typeof node.type !== "string") return toSvg(children);
  const attrs = Object.entries(props)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => ` ${attrName(k)}="${esc(String(v))}"`)
    .join("");
  return `<${node.type}${attrs}>${toSvg(children)}</${node.type}>`;
}

/** رسمة الختم المتجهية كـ SVG مستقل: متغيرات CSS تُستبدل بألوان القالب الفعلية */
function vectorStamp(d: Design, state: StampState, uid: string): string {
  const vars: Record<string, string> = {
    "--qc-bg": d.colors.bg,
    "--qc-bg2": d.colors.bg2,
    "--qc-text": d.colors.text,
    "--qc-accent": d.colors.accent,
    "--qc-fill": d.colors.stampFill,
    "--qc-empty": d.colors.stampEmpty,
  };
  return (
    toSvg(createElement(StampArt, { style: d.stamp.style, state, uid, design: d }))
      .replace(/var\((--qc-[a-z0-9]+)\)/g, (m, k: string) => vars[k] ?? m)
      // نص الختم الدائري يحتاج خطاً عربياً غير موجود على السيرفر، فيبقى الختم بدون كتابة
      .replace(/<text[\s\S]*?<\/text>/g, "")
  );
}

/** صور الحالات الثلاث للنمط المختار: data URI للصور، أو null للأنماط المتجهية */
async function stampImages(d: Design): Promise<Record<StampState, string> | null> {
  const states: StampState[] = ["empty", "filled", "reward"];
  if (d.stamp.style === "photo") {
    const imgs = await Promise.all(states.map((s) => libraryImage(s)));
    return { empty: imgs[0], filled: imgs[1], reward: imgs[2] };
  }
  if (d.stamp.style === "takeaway") {
    const imgs = await Promise.all(states.map((s) => libraryImage(s, "takeaway")));
    return { empty: imgs[0], filled: imgs[1], reward: imgs[2] };
  }
  if (d.stamp.style === "custom") {
    const imgs = await Promise.all(states.map(async (s) => (await assetImage(d.stamp.custom[s])) ?? (await libraryImage(s))));
    return { empty: imgs[0], filled: imgs[1], reward: imgs[2] };
  }
  return null;
}

function slotShape(d: Design, cx: number, cy: number, dia: number, fill: string, fillOpacity: number, stroke: string, ring: number): string {
  const r = dia / 2;
  const common = `fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${ring}"`;
  switch (d.stamp.shape) {
    case "circle":
      return `<circle cx="${cx}" cy="${cy}" r="${r - ring / 2}" ${common}/>`;
    case "rounded":
    case "square": {
      const rx = d.stamp.shape === "rounded" ? dia * 0.24 : dia * 0.06;
      return `<rect x="${cx - r + ring / 2}" y="${cy - r + ring / 2}" width="${dia - ring}" height="${dia - ring}" rx="${rx}" ${common}/>`;
    }
    default:
      return "";
  }
}

/** SVG الشريط: n كوب، المختوم منها filled، والخانة الأخيرة الكوب المجاني (نفس ترتيب البطاقة: من اليمين) */
export async function stripSvg(d: Design, goal: number, filled: number, scale: number): Promise<string> {
  const W = STRIP_W * scale;
  const H = STRIP_H * scale;
  const c = d.colors;
  const slots = goal + 1;
  const images = await stampImages(d);
  const bgImage = await assetImage(d.background.assetId);
  const frame = (body: string, lines: boolean) => {
    const line = Math.max(1, scale);
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${bgImage ? `<image href="${bgImage}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="${d.background.opacity / 100}"/>` : ""}
${lines ? `<rect y="${H * 0.02}" width="${W}" height="${line}" fill="${c.border}" opacity="0.55"/>\n<rect y="${H * 0.98 - line}" width="${W}" height="${line}" fill="${c.border}" opacity="0.55"/>` : ""}
${body}
</svg>`;
  };
  if (d.layout === "cups") return frame(cupsRow(d, images, goal, filled, W, H), false);

  const rows = slots <= 7 ? 1 : 2;
  const perRow = Math.ceil(slots / rows);
  // هامش أفقي آمن حتى لا يقص الجوال أطراف الأكواب
  const safe = W * 0.88;
  const gap = W * 0.018;
  const dia = Math.min(H * (rows === 1 ? 0.66 : 0.42), (safe - gap * (perRow - 1)) / perRow);
  const vgap = H * 0.05;
  const ring = Math.max(1.5, dia * 0.035);

  const parts: string[] = [];
  for (let i = 0; i < slots; i++) {
    const r = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = r < rows - 1 ? perRow : slots - perRow * (rows - 1);
    const total = dia * inRow + gap * (inRow - 1);
    const x0 = (W - total) / 2;
    const cy = H / 2 + (r - (rows - 1) / 2) * (dia + vgap);
    const cx = W - (x0 + dia / 2 + col * (dia + gap));
    const state: StampState = i === goal ? "reward" : i < filled ? "filled" : "empty";
    if (state === "reward") parts.push(slotShape(d, cx, cy, dia, c.accent, filled >= goal ? 0.3 : 0.14, c.accent, ring));
    else if (state === "filled") parts.push(slotShape(d, cx, cy, dia, c.stampFill, 0.16, c.stampFill, ring));
    else parts.push(slotShape(d, cx, cy, dia, c.stampEmpty, 0.28, c.stampEmpty, ring));

    const art = dia * (images ? 0.84 : 0.78);
    const x = cx - art / 2;
    const y = cy - art / 2 - dia * 0.02;
    // الكوب المجاني باهت حتى تكتمل الأختام، حتى لا يُحسب كختم مكتمل
    const dim = state === "empty" ? ' opacity="0.5"' : state === "reward" && filled < goal ? ' opacity="0.4"' : "";
    if (images) {
      parts.push(`<image href="${images[state]}" x="${x}" y="${y}" width="${art}" height="${art}" preserveAspectRatio="xMidYMid meet"${dim}/>`);
    } else {
      const svg = vectorStamp(d, state, `s${i}`).replace("<svg ", `<svg x="${x}" y="${y}" width="${art}" height="${art}"${dim} `);
      parts.push(svg);
    }
  }

  return frame(parts.join("\n"), true);
}

/** تخطيط «صف الأكواب»: صف واحد متعرّج بلا خانات، الأكواب المختومة بشعار قمرا والفارغة بيضاء */
function cupsRow(d: Design, images: Record<StampState, string> | null, goal: number, filled: number, W: number, H: number): string {
  const slots = goal + 1;
  const step = (W * 0.92) / slots;
  // صور الأكواب طولية (4:5)، والرسومات المتجهية مربعة
  const ratio = images ? 0.8 : 1;
  const cw = Math.min(step * 1.3, H * 0.62 * ratio);
  const ch = cw / ratio;
  const lift = H * 0.09;
  const items = Array.from({ length: slots }, (_, i) => {
    const state: StampState = i === goal ? "reward" : i < filled ? "filled" : "empty";
    const up = i % 2 === 0;
    const cx = W - (W - step * slots) / 2 - step * (i + 0.5);
    const cy = H / 2 + (up ? -lift : lift);
    return { i, state, up, x: cx - cw / 2, y: cy - ch / 2 };
  });
  // الأكواب المرتفعة خلف المنخفضة، مثل صف أكواب على طاولة
  items.sort((a, b) => Number(!a.up) - Number(!b.up));
  return items
    .map(({ i, state, x, y }) => {
      const dim = state === "reward" && filled < goal ? ' opacity="0.55"' : "";
      if (images) return `<image href="${images[state]}" x="${x}" y="${y}" width="${cw}" height="${ch}" preserveAspectRatio="xMidYMid meet"${dim}/>`;
      return vectorStamp(d, state, `s${i}`).replace("<svg ", `<svg x="${x}" y="${y}" width="${cw}" height="${ch}"${dim} `);
    })
    .join("\n");
}

/** شريط الأختام PNG حسب التصميم المنشور */
export function renderStrip(d: Design, goal: number, filled: number, scale: 1 | 2 | 3): Promise<Buffer> {
  return cached(`strip:${designHash(d)}:${goal}:${filled}:${scale}`, async () => {
    const svg = await stripSvg(d, goal, filled, scale);
    return (await sharp())(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  });
}

/** شعار البطاقة من الشعار المرفوع (Apple: حتى 160×50 نقطة)، أو null إن لم يُرفع شعار */
export async function renderLogo(d: Design, scale: 1 | 2 | 3): Promise<Buffer | null> {
  if (d.layout === "cups") return renderWordmark(d.colors.text, scale);
  const id = d.logoAssetId;
  if (!id) return null;
  return cached(`logo:${id}:${scale}`, async () => {
    const a = await getAssetFile(id);
    if (!a) throw new Error("logo asset missing");
    return (await sharp())(Buffer.from(a.data))
      .resize(160 * scale, 50 * scale, { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
  }).catch(() => null);
}

/** شعار شاهي قمرا المكتوب (public/brand، أبيض شفاف) بلون نص القالب: قالب صف الأكواب يعرضه بدل الأيقونة واسم المحل */
export function renderWordmark(color: string, scale: 1 | 2 | 3): Promise<Buffer | null> {
  return cached(`wordmark:${color}:${scale}`, async () => {
    const s = await sharp();
    const src = await readFile(path.join(process.cwd(), "public", "brand", "qamra-wordmark.png"));
    const alpha = await s(src).resize(160 * scale, 50 * scale, { fit: "inside" }).extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
    const { width, height } = alpha.info;
    return s({ create: { width, height, channels: 3, background: color } })
      .joinChannel(alpha.data, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
  }).catch(() => null);
}
