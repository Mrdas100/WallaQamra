import { prisma } from "@/lib/db";
import { maskPhone } from "@/lib/phone";

/** تحويل آمن لـ CSV (يمنع حقن الصيغ في Excel) */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM لكي يفتح Excel العربية بشكل صحيح
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function customersCsv(businessId: string, fullPhone: boolean): Promise<string> {
  const customers = await prisma.customer.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } });
  const balances = await prisma.ledgerEntry.groupBy({
    by: ["customerId", "unit"],
    where: { businessId },
    _sum: { points: true },
  });
  const bal = new Map(balances.map((b) => [`${b.customerId}:${b.unit}`, b._sum.points ?? 0]));
  return toCsv(
    ["id", "name", "phone", "points", "stamps", "referralCode", "promoOptOut", "createdAt"],
    customers.map((c) => [
      c.id,
      c.name,
      fullPhone ? c.phone : maskPhone(c.phone),
      bal.get(`${c.id}:POINT`) ?? 0,
      bal.get(`${c.id}:STAMP`) ?? 0,
      c.referralCode,
      c.promoOptOut,
      c.createdAt,
    ]),
  );
}

export async function ledgerCsv(businessId: string, from: Date, to: Date): Promise<string> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { businessId, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
    include: { staff: { select: { username: true } }, order: { select: { externalRef: true } } },
    take: 100_000,
  });
  return toCsv(
    ["id", "createdAt", "customerId", "type", "unit", "points", "orderRef", "staff", "device", "ip", "reason", "reversesEntryId"],
    entries.map((e) => [
      e.id,
      e.createdAt,
      e.customerId,
      e.type,
      e.unit,
      e.points,
      e.order?.externalRef ?? "",
      e.staff?.username ?? "",
      e.deviceId ?? "",
      e.ip ?? "",
      e.reason ?? "",
      e.reversesEntryId ?? "",
    ]),
  );
}
