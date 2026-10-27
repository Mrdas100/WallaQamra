import { route } from "@/lib/api";
import { buildReport } from "@/modules/reports";

export const GET = route({ name: "admin", role: "MANAGER" }, async ({ req, actor }) => {
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  return buildReport(actor.businessId, days);
});
