import { parseJson, route } from "@/lib/api";
import { saveCampaign } from "@/modules/catalog";
import { CampaignBody } from "../schema";

export const PATCH = route<{ id: string }>(
  { name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } },
  async ({ req, actor, params }) => saveCampaign(actor, params.id, await parseJson(req, CampaignBody)),
);
