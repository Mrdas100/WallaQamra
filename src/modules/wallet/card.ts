import type { BranchLocation, Customer, Platform, Tier, Unit, WalletPass } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { getBusiness, getSettings } from "../business";
import { cardUrl, customerTier } from "../customers";
import { getBalance } from "../ledger";
import { issueQrToken } from "../qr";
import { TIER_LABEL, unitForMode } from "../rules";
import { MAX_LOCATIONS } from "../rules";
import { getPublishedDesign } from "../design/service";
import type { Design } from "../design/config";
import { designHash } from "./art";
import { stampStripFile } from "./stamps";

/** البيانات المشتركة التي تُبنى منها بطاقتا Apple وGoogle */
export interface CardModel {
  businessId: string;
  businessName: string;
  /** التصميم المنشور من لوحة الإدارة (ألوان وأختام وشعار البطاقة في المحفظة) */
  design: Design;
  /** بصمة التصميم، تدخل في روابط صور Google لكي تُحدَّث عند النشر */
  designVersion: string;
  serial: string;
  authToken: string;
  customerId: string;
  customerName: string;
  unit: Unit;
  balance: number;
  tier: Tier;
  tierLabel: string;
  nextRewardCost: number;
  remainingToReward: number;
  /** وضع الأختام: اسم صورة الشريط @2x (للموقع وGoogle)، وnull في وضع النقاط */
  stampStrip: string | null;
  qrToken: string;
  cardUrl: string;
  offerText: string;
  offerNotify: boolean;
  noticeText: string;
  locations: Pick<BranchLocation, "latitude" | "longitude" | "relevantText" | "maxDistance">[];
  memberSince: Date;
}

export const unitLabel = (unit: Unit) => (unit === "STAMP" ? "الأختام" : "النقاط");
export const unitWord = (unit: Unit) => (unit === "STAMP" ? "ختم" : "نقطة");

export function renderRelevantText(template: string, m: Pick<CardModel, "balance" | "customerName" | "unit">): string {
  const first = m.customerName.split(" ")[0] ?? "";
  return template
    .replaceAll("{points}", String(m.balance))
    .replaceAll("{name}", first)
    .replaceAll("{unit}", unitWord(m.unit));
}

export async function ensurePass(customer: Customer, platform: Platform): Promise<WalletPass> {
  const existing = await prisma.walletPass.findUnique({
    where: { customerId_platform: { customerId: customer.id, platform } },
  });
  if (existing) return existing;
  try {
    return await prisma.walletPass.create({
      data: {
        businessId: customer.businessId,
        customerId: customer.id,
        platform,
        serial: randomToken(16),
        authToken: randomToken(24),
      },
    });
  } catch {
    return prisma.walletPass.findUniqueOrThrow({
      where: { customerId_platform: { customerId: customer.id, platform } },
    });
  }
}

export async function buildCardModel(pass: WalletPass, now = new Date()): Promise<CardModel> {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: pass.customerId } });
  const [settings, business, design] = await Promise.all([
    getSettings(pass.businessId),
    getBusiness(pass.businessId),
    getPublishedDesign(pass.businessId),
  ]);
  const unit = unitForMode(settings.programMode);
  const [balance, tier, locations] = await Promise.all([
    getBalance(customer.id, unit),
    customerTier(customer.id, settings, now),
    prisma.branchLocation.findMany({
      where: { businessId: pass.businessId, active: true },
      orderBy: { createdAt: "asc" },
      take: MAX_LOCATIONS,
    }),
  ]);
  const nextRewardCost = unit === "STAMP" ? settings.stampsPerReward : settings.rewardThreshold;
  return {
    businessId: pass.businessId,
    businessName: business.name,
    design,
    designVersion: designHash(design),
    serial: pass.serial,
    authToken: pass.authToken,
    customerId: customer.id,
    customerName: customer.name,
    unit,
    balance,
    tier,
    tierLabel: TIER_LABEL[tier],
    nextRewardCost,
    remainingToReward: Math.max(0, nextRewardCost - balance),
    stampStrip: unit === "STAMP" ? stampStripFile(nextRewardCost, balance, 2) : null,
    qrToken: issueQrToken(customer.id, env.qrPassTtlHours * 3600, now),
    cardUrl: cardUrl(customer),
    offerText: pass.offerText,
    offerNotify: pass.offerNotify,
    noticeText: pass.noticeText,
    locations,
    memberSince: customer.createdAt,
  };
}

/** يسجّل وقت إصدار QR في البطاقة لكي يجدده cron قبل انتهائه */
export async function markQrIssued(passId: string, now = new Date()) {
  await prisma.walletPass.update({ where: { id: passId }, data: { qrIssuedAt: now } });
}
