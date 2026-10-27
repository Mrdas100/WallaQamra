import { route } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { addDays } from "@/lib/time";
import { audit } from "@/modules/audit";
import { customersCsv, ledgerCsv } from "@/modules/csv";

export const GET = route<{ kind: string }>(
  { name: "export", role: "ADMIN", rate: { limit: 10, windowSec: 600, by: "staff" } },
  async ({ req, actor, params }) => {
    let csv: string;
    if (params.kind === "customers") {
      csv = await customersCsv(actor.businessId, true);
    } else if (params.kind === "ledger") {
      const days = Math.min(3650, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 90));
      const now = new Date();
      csv = await ledgerCsv(actor.businessId, addDays(now, -days), now);
    } else {
      throw new AppError("NOT_FOUND", "نوع التصدير غير معروف");
    }
    await audit(actor, "export.csv", "Export", params.kind, null, null);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${params.kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  },
);
