export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { walletSelfCheck } = await import("@/modules/wallet/selfcheck");
  const r = walletSelfCheck();
  for (const [name, s] of Object.entries(r)) {
    const line = `[wallet] ${name}: ${s.mode}${s.problem ? ` — PROBLEM: ${s.problem}` : ""}`;
    if (s.problem) console.error(line);
    else console.log(line);
  }
}
