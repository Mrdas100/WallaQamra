import { getPublishedDesign } from "@/modules/design/service";
import { designHash, renderStrip, stripInRange } from "@/modules/wallet/art";

// شريط الأختام لبطاقة Google Wallet (Google يجلب الصورة من رابط عام).
// يُرسم دائماً من التصميم المنشور، والبصمة في الرابط فقط لتجديد نسخة Google المخزّنة.
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string; version: string; file: string }> }) {
  const { businessId, version, file } = await params;
  const m = /^(\d{1,2})-(\d{1,2})\.png$/.exec(file);
  const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  if (!m || !/^[a-z0-9]{20,32}$/.test(businessId) || !/^[0-9a-f]{12}$/.test(version)) return notFound();
  const goal = Number(m[1]);
  const filled = Number(m[2]);
  if (!stripInRange(goal, filled)) return notFound();
  const design = await getPublishedDesign(businessId).catch(() => null);
  if (!design) return notFound();
  const png = await renderStrip(design, goal, filled, 2);
  const current = designHash(design) === version;
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-length": String(png.length),
      "cache-control": current ? "public, max-age=31536000, immutable" : "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
