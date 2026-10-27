import { prisma, type Db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Business, Settings } from "@prisma/client";

/** v1: محل واحد. يُنشأ تلقائياً عند أول استخدام. */
export async function getDefaultBusiness(): Promise<Business> {
  const slug = env.businessSlug;
  const existing = await prisma.business.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.business.upsert({
    where: { slug },
    update: {},
    create: { slug, name: env.businessName, settings: { create: {} } },
  });
}

export async function getSettings(businessId: string, db: Db = prisma): Promise<Settings> {
  const s = await db.settings.findUnique({ where: { businessId } });
  if (s) return s;
  return db.settings.upsert({ where: { businessId }, update: {}, create: { businessId } });
}

export async function getBusiness(businessId: string, db: Db = prisma): Promise<Business> {
  return db.business.findUniqueOrThrow({ where: { id: businessId } });
}
