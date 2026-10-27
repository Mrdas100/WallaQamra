import { route } from "@/lib/api";
import { authorizedPass } from "@/modules/wallet/apple-service";
import { generateApplePass } from "@/modules/wallet/apple";

type P = { passTypeId: string; serial: string };

export const GET = route<P>({ name: "apple-ws", rate: { limit: 60, windowSec: 60 } }, async ({ req, params }) => {
  const pass = await authorizedPass(req, params.passTypeId, params.serial);
  const since = req.headers.get("if-modified-since");
  const lastSec = Math.floor(pass.contentUpdatedAt.getTime() / 1000);
  if (since) {
    const sinceMs = Date.parse(since);
    if (Number.isFinite(sinceMs) && lastSec <= Math.floor(sinceMs / 1000)) return new Response(null, { status: 304 });
  }
  const result = await generateApplePass(pass);
  const headers = { "last-modified": new Date(lastSec * 1000).toUTCString(), "cache-control": "no-store" };
  if (result.devMode) return Response.json(result.passJson, { headers });
  return new Response(new Uint8Array(result.buffer), {
    headers: { ...headers, "content-type": "application/vnd.apple.pkpass" },
  });
});
