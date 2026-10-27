import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
