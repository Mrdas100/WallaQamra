import type { Role } from "@prisma/client";
import type { RequestMeta } from "@/lib/request";

/** من ينفذ العملية: الموظف + الجهاز + IP (يُحفظ مع كل حركة) */
export interface Actor extends RequestMeta {
  businessId: string;
  staffId: string;
  role: Role;
}

const RANK: Record<Role, number> = { CASHIER: 1, MANAGER: 2, ADMIN: 3 };

export const hasRole = (role: Role, min: Role): boolean => RANK[role] >= RANK[min];
