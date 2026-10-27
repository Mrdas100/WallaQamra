import { route } from "@/lib/api";
import { updatedSerials, validDeviceId } from "@/modules/wallet/apple-service";

type P = { deviceId: string; passTypeId: string };

export const GET = route<P>({ name: "apple-ws", rate: { limit: 60, windowSec: 60 } }, async ({ req, params }) => {
  if (!validDeviceId(params.deviceId)) return new Response(null, { status: 204 });
  const since = new URL(req.url).searchParams.get("passesUpdatedSince");
  const result = await updatedSerials(params.deviceId, params.passTypeId, since);
  if (!result) return new Response(null, { status: 204 });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
});
