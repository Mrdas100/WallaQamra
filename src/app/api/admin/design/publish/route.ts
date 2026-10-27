import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { publishDraft } from "@/modules/design/service";

const Body = z.object({ draftVersion: z.number().int().min(1), confirm: z.literal(true) }).strict();

export const POST = route({ name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } }, async ({ req, actor }) => {
  const body = await parseJson(req, Body);
  return publishDraft(actor, body.draftVersion);
});
