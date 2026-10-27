import { route } from "@/lib/api";
import { discardDraft } from "@/modules/design/service";

export const POST = route({ name: "admin-write", role: "ADMIN", rate: { limit: 20, windowSec: 60, by: "staff" } }, async ({ actor }) =>
  discardDraft(actor),
);
