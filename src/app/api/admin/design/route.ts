import { parseJson, route } from "@/lib/api";
import { z } from "zod";
import { getDesignState, saveDraft } from "@/modules/design/service";

export const GET = route({ name: "admin", role: "ADMIN" }, async ({ actor }) => getDesignState(actor.businessId));

// حفظ المسودة فقط؛ العملاء لا يرون شيئاً حتى النشر
export const PUT = route({ name: "admin-write", role: "ADMIN", rate: { limit: 60, windowSec: 60, by: "staff" } }, async ({ req, actor }) =>
  saveDraft(actor, (await parseJson(req, z.object({ design: z.unknown() }).strict())).design),
);
