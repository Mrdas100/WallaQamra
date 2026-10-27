export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { walletSelfCheck } = await import("@/modules/wallet/selfcheck");
  const r = walletSelfCheck();
  for (const [name, s] of Object.entries(r)) {
    const line = `[wallet] ${name}: ${s.mode}${s.problem ? ` — PROBLEM: ${s.problem}` : ""}`;
    if (s.problem) console.error(line);
    else console.log(line);
  }
  // إنشاء/تحديث فئة Google (Loyalty Class) عند الإقلاع، فلا ننتظر أول عميل؛ Google تشترطها قبل طلب إذن النشر
  if (r.google.mode === "live" && !r.google.problem) void syncGoogleClass();
}

async function syncGoogleClass() {
  try {
    const { getDefaultBusiness } = await import("@/modules/business");
    const { classId, ensureGoogleClass } = await import("@/modules/wallet/google");
    await ensureGoogleClass((await getDefaultBusiness()).name);
    console.log(`[wallet] google class ready: ${classId()}`);
  } catch (e) {
    console.error(`[wallet] google class sync failed: ${(e as Error).message}`);
  }
}
