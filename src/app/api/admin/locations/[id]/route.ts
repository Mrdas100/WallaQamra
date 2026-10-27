import { parseJson, route } from "@/lib/api";
import { deleteLocation, saveLocation } from "@/modules/catalog";
import { LocationBody } from "../schema";

const opts = { name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } } as const;

export const PATCH = route<{ id: string }>(opts, async ({ req, actor, params }) =>
  saveLocation(actor, params.id, await parseJson(req, LocationBody)),
);

export const DELETE = route<{ id: string }>(opts, async ({ actor, params }) => {
  await deleteLocation(actor, params.id);
  return null;
});
