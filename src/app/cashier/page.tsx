import { pageStaff } from "@/ui/server-auth";
import CashierApp from "./cashier-app";

export const metadata = { title: "الكاشير — شاهي قمرا" };

export default async function CashierPage() {
  const staff = await pageStaff("CASHIER");
  return <CashierApp staffName={staff.name} role={staff.role} />;
}
