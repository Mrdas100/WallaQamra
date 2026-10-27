import { createHash } from "node:crypto";
import type { DesignStage, Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { assetIdsOf, DEFAULT_DESIGN, DesignSchema, parseDesign, type Design } from "./config";

// المسودة والنسخة المنشورة منفصلتان: الحفظ يكتب المسودة فقط، والنشر ينسخها للعملاء.

export interface DesignState {
  draft: Design;
  published: Design;
  draftVersion: number;
  publishedVersion: number;
  /** هل في المسودة تغييرات لم تُنشر */
  dirty: boolean;
  publishedAt: Date | null;
}

async function row(businessId: string, stage: DesignStage, db: Db = prisma) {
  return db.cardDesign.findUnique({ where: { businessId_stage: { businessId, stage } } });
}

/** التصميم الذي يراه العملاء */
export async function getPublishedDesign(businessId: string, db: Db = prisma): Promise<Design> {
  const r = await row(businessId, "PUBLISHED", db);
  return r ? parseDesign(r.config) : DEFAULT_DESIGN;
}

export async function getDesignState(businessId: string): Promise<DesignState> {
  const [d, p] = await Promise.all([row(businessId, "DRAFT"), row(businessId, "PUBLISHED")]);
  const published = p ? parseDesign(p.config) : DEFAULT_DESIGN;
  const draft = d ? parseDesign(d.config) : published;
  return {
    draft,
    published,
    draftVersion: d?.version ?? 0,
    publishedVersion: p?.version ?? 0,
    dirty: JSON.stringify(draft) !== JSON.stringify(published),
    publishedAt: p?.updatedAt ?? null,
  };
}

async function assertAssetsOwned(businessId: string, d: Design, db: Db) {
  const ids = assetIdsOf(d);
  if (ids.length === 0) return;
  const found = await db.designAsset.count({ where: { businessId, id: { in: ids } } });
  if (found !== ids.length) throw new AppError("BAD_REQUEST", "إحدى الصور غير موجودة، ارفعها من جديد");
}

const json = (d: Design) => d as unknown as Prisma.InputJsonValue;

export async function saveDraft(actor: Actor, input: unknown): Promise<DesignState> {
  const design = DesignSchema.parse(input);
  await assertAssetsOwned(actor.businessId, design, prisma);
  await prisma.$transaction(async (tx) => {
    const before = await row(actor.businessId, "DRAFT", tx);
    await tx.cardDesign.upsert({
      where: { businessId_stage: { businessId: actor.businessId, stage: "DRAFT" } },
      update: { config: json(design), version: { increment: 1 }, updatedById: actor.staffId },
      create: { businessId: actor.businessId, stage: "DRAFT", config: json(design), updatedById: actor.staffId },
    });
    await audit(actor, "design.save_draft", "CardDesign", before?.id ?? null, null, { template: design.template }, tx);
  });
  return getDesignState(actor.businessId);
}

/** ينشر المسودة لكل العملاء. expectedDraftVersion يمنع نشر نسخة غير التي راجعها المدير. */
export async function publishDraft(actor: Actor, expectedDraftVersion: number): Promise<DesignState> {
  await prisma.$transaction(async (tx) => {
    const draft = await row(actor.businessId, "DRAFT", tx);
    if (!draft) throw new AppError("BAD_REQUEST", "لا توجد مسودة محفوظة للنشر");
    if (draft.version !== expectedDraftVersion) {
      throw new AppError("CONFLICT", "تغيّرت المسودة منذ آخر معاينة، راجعها ثم انشر");
    }
    const design = DesignSchema.parse(draft.config);
    await assertAssetsOwned(actor.businessId, design, tx);
    const pub = await tx.cardDesign.upsert({
      where: { businessId_stage: { businessId: actor.businessId, stage: "PUBLISHED" } },
      update: { config: json(design), version: { increment: 1 }, updatedById: actor.staffId },
      create: { businessId: actor.businessId, stage: "PUBLISHED", config: json(design), updatedById: actor.staffId },
    });
    await audit(actor, "design.publish", "CardDesign", pub.id, null, { version: pub.version, template: design.template }, tx);
  });
  return getDesignState(actor.businessId);
}

/** يلغي تغييرات المسودة ويرجعها للنسخة المنشورة */
export async function discardDraft(actor: Actor): Promise<DesignState> {
  const published = await getPublishedDesign(actor.businessId);
  return saveDraft(actor, published);
}

// ---- الصور المرفوعة ----

export const ASSET_KINDS = ["logo", "stamp", "background", "slide"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const MAX_ASSET_BYTES = 1_500_000;
const MAX_DIM = 4096;
const MAX_ASSETS_PER_BUSINESS = 300;

type Sniffed = { mime: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number };

/** يتعرف على نوع الصورة من محتواها (لا نثق بالامتداد أو Content-Type). SVG مرفوض عمداً. */
export function sniffImage(b: Buffer): Sniffed | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString("ascii", 12, 16) === "IHDR") {
    return { mime: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      // SOF0..SOF15 ما عدا DHT/JPG/DAC
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: "image/jpeg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { mime: "image/webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { mime: "image/webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

export async function uploadAsset(actor: Actor, kind: string, data: Buffer) {
  if (!(ASSET_KINDS as readonly string[]).includes(kind)) throw new AppError("BAD_REQUEST", "نوع الصورة غير معروف");
  if (data.length === 0) throw new AppError("BAD_REQUEST", "الملف فارغ");
  if (data.length > MAX_ASSET_BYTES) throw new AppError("BAD_REQUEST", "حجم الصورة أكبر من 1.5 ميجابايت");
  const info = sniffImage(data);
  if (!info) throw new AppError("BAD_REQUEST", "الصيغ المسموحة: PNG أو JPG أو WebP");
  if (info.width < 16 || info.height < 16 || info.width > MAX_DIM || info.height > MAX_DIM) {
    throw new AppError("BAD_REQUEST", "أبعاد الصورة يجب أن تكون بين 16 و4096 بكسل");
  }
  const sha = createHash("sha256").update(data).digest("hex");
  const existing = await prisma.designAsset.findUnique({
    where: { businessId_sha256: { businessId: actor.businessId, sha256: sha } },
    select: { id: true, kind: true, mime: true, width: true, height: true, size: true, createdAt: true },
  });
  if (existing) return existing;
  if ((await prisma.designAsset.count({ where: { businessId: actor.businessId } })) >= MAX_ASSETS_PER_BUSINESS) {
    throw new AppError("BAD_REQUEST", "وصلت للحد الأقصى من الصور المرفوعة");
  }
  const asset = await prisma.designAsset.create({
    data: {
      businessId: actor.businessId,
      kind,
      mime: info.mime,
      width: info.width,
      height: info.height,
      size: data.length,
      sha256: sha,
      data: new Uint8Array(data),
      createdById: actor.staffId,
    },
    select: { id: true, kind: true, mime: true, width: true, height: true, size: true, createdAt: true },
  });
  await audit(actor, "design.upload", "DesignAsset", asset.id, null, { kind, mime: info.mime, size: data.length });
  return asset;
}

export function listAssets(businessId: string) {
  return prisma.designAsset.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, mime: true, width: true, height: true, size: true, createdAt: true },
  });
}

export function getAssetFile(id: string) {
  if (!/^[a-z0-9]{20,32}$/.test(id)) return null;
  return prisma.designAsset.findUnique({ where: { id }, select: { mime: true, data: true, sha256: true } });
}
