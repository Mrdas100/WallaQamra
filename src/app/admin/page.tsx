import { pageStaff } from "@/ui/server-auth";
import AdminApp from "./admin-app";

export const metadata = { title: "الإدارة — شاهي قمرا" };

export default async function AdminPage() {
  const staff = await pageStaff("MANAGER");
  return <AdminApp staffName={staff.name} role={staff.role} staffId={staff.id} />;
}
