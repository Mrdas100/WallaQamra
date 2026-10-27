import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getSettings } from "@/modules/business";
import { cashierView } from "@/modules/customers";

export const GET = route<{ id: string }>({ name: "admin", role: "MANAGER" }, async ({ actor, params }) => {
  const c = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!c || c.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "العميل غير موجود");
  const [view, entries, orders] = await Promise.all([
    cashierView(c, await getSettings(actor.businessId)),
    prisma.ledgerEntry.findMany({
      where: { customerId: c.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { staff: { select: { username: true } } },
    }),
    prisma.order.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return { ...view, entries, orders, phone: actor.role === "ADMIN" ? c.phone : view.maskedPhone };
});
