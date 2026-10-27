import { route } from "@/lib/api";

export const GET = route({ name: "me", role: "CASHIER" }, async ({ staff }) => staff);
