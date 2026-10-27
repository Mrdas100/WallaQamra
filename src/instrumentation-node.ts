import { prisma } from "@/lib/db";
import { getDefaultBusiness } from "@/modules/business";
import { enqueueAllPasses } from "@/modules/wallet/sync";
import { classId, ensureGoogleClass } from "@/modules/wallet/google";
import { walletSelfCheck } from "@/modules/wallet/selfcheck";

// فحوصات الإقلاع (Node فقط): سلامة شهادات المحافظ، ثم إنشاء/تحديث فئة Google
export function startupChecks() {
  const r = walletSelfCheck();
  for (const [name, s] of Object.entries(r)) {
    const line = `[wallet] ${name}: ${s.mode}${s.problem ? ` — PROBLEM: ${s.problem}` : ""}`;
    if (s.problem) console.error(line);
    else console.log(line);
  }
  // Google تشترط وجود الفئة قبل طلب إذن النشر، فلا ننتظر أول عميل
  if (r.google.mode === "live" && !r.google.problem) void syncGoogleClass();
  void refreshPassArt();
}

// غيّر هذا الرقم عند تغيير صور البطاقة (الشريط/الشعار) لتُحدَّث كل البطاقات المحفوظة في جوالات العملاء مرة واحدة
const PASS_ART_VERSION = "2026-10-27-owed";

async function refreshPassArt() {
  try {
    const business = await getDefaultBusiness();
    const done = await prisma.auditLog.findFirst({ where: { businessId: business.id, action: "wallet.art_refresh", entityId: PASS_ART_VERSION } });
    if (done) return;
    await prisma.auditLog.create({ data: { businessId: business.id, action: "wallet.art_refresh", entity: "WalletPass", entityId: PASS_ART_VERSION } });
    const n = await enqueueAllPasses(business.id, "PASS_UPDATE");
    console.log(`[wallet] queued ${n} pass updates for new card art ${PASS_ART_VERSION}`);
  } catch (e) {
    console.error(`[wallet] pass art refresh failed: ${(e as Error).message}`);
  }
}

async function syncGoogleClass() {
  try {
    await ensureGoogleClass((await getDefaultBusiness()).name);
    console.log(`[wallet] google class ready: ${classId()}`);
  } catch (e) {
    console.error(`[wallet] google class sync failed: ${(e as Error).message}`);
  }
}
