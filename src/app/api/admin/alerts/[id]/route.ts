import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

// تأكيد قراءة التنبيه
export const POST = route<{ id: string }>({ name: "admin-write", role: "MANAGER" }, async ({ actor, params }) => {
  const res = await prisma.fraudAlert.updateMany({
    where: { id: params.id, businessId: actor.businessId, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: actor.staffId },
  });
  if (res.count === 0) throw new AppError("NOT_FOUND", "التنبيه غير موجود");
  return null;
});
