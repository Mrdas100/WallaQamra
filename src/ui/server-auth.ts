import "server-only";
import type { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasRole } from "@/modules/actor";
import { SESSION_COOKIE, staffFromToken, type AuthedStaff } from "@/modules/auth";

/** تحقق الصلاحية في السيرفر قبل عرض أي صفحة إدارية */
export async function pageStaff(min: Role): Promise<AuthedStaff> {
  const jar = await cookies();
  const staff = await staffFromToken(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!staff) redirect("/login");
  if (!hasRole(staff.role, min)) redirect(staff.role === "CASHIER" ? "/cashier" : "/login");
  return staff;
}
