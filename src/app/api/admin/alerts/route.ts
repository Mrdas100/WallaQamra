import { route } from "@/lib/api";
import { listOpenAlerts } from "@/modules/alerts";

export const GET = route({ name: "admin", role: "MANAGER" }, async ({ actor }) => listOpenAlerts(actor.businessId));
