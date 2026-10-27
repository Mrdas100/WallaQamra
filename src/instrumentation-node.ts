import { getDefaultBusiness } from "@/modules/business";
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
}

async function syncGoogleClass() {
  try {
    await ensureGoogleClass((await getDefaultBusiness()).name);
    console.log(`[wallet] google class ready: ${classId()}`);
  } catch (e) {
    console.error(`[wallet] google class sync failed: ${(e as Error).message}`);
  }
}
