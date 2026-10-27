import { getAssetFile } from "@/modules/design/service";

// صور التصميم المرفوعة. المعرّف لا يتغير ومحتواه ثابت، فنسمح بالتخزين المؤقت الطويل.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await (getAssetFile(id) ?? Promise.resolve(null)).catch(() => null);
  if (!asset) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "content-type": asset.mime,
      "content-length": String(asset.data.length),
      "cache-control": "public, max-age=31536000, immutable",
      etag: `"${asset.sha256.slice(0, 32)}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
