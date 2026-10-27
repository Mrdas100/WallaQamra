import { parseJson, route } from "@/lib/api";
import { saveReward } from "@/modules/catalog";
import { RewardBody } from "../schema";

export const PATCH = route<{ id: string }>(
  { name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } },
  async ({ req, actor, params }) => saveReward(actor, params.id, await parseJson(req, RewardBody)),
);
