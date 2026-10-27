import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { maskPhone, normalizePhone } from "@/lib/phone";

export const GET = route({ name: "admin", role: "MANAGER" }, async ({ req, actor }) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  const phone = q ? normalizePhone(q) : null;
  const customers = await prisma.customer.findMany({
    where: {
      businessId: actor.businessId,
      ...(phone ? { phone } : q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { referralCode: q.toUpperCase() }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const sums = await prisma.ledgerEntry.groupBy({
    by: ["customerId", "unit"],
    where: { customerId: { in: customers.map((c) => c.id) } },
    _sum: { points: true },
  });
  const bal = new Map(sums.map((s) => [`${s.customerId}:${s.unit}`, s._sum.points ?? 0]));
  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: actor.role === "ADMIN" ? c.phone : maskPhone(c.phone),
    points: bal.get(`${c.id}:POINT`) ?? 0,
    stamps: bal.get(`${c.id}:STAMP`) ?? 0,
    referralCode: c.referralCode,
    createdAt: c.createdAt,
  }));
});
