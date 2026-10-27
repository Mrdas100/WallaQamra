import { route, NO_STORE } from "@/lib/api";
import { customerFromRequest } from "@/lib/card-auth";
import { ensurePass } from "@/modules/wallet/card";
import { googleSaveUrl } from "@/modules/wallet/google";

export const GET = route<{ id: string }>({ name: "google-pass", rate: { limit: 10, windowSec: 60 } }, async ({ req, params }) => {
  const c = await customerFromRequest(req, params.id);
  const pass = await ensurePass(c, "GOOGLE");
  const r = await googleSaveUrl(pass);
  if (r.devMode) {
    return Response.json(
      { ok: true, devMode: true, message: "وضع التطوير: لم تُضبط بيانات Google Wallet، هذه معاينة الكائن", object: r.object },
      { headers: NO_STORE },
    );
  }
  return new Response(null, { status: 303, headers: { ...NO_STORE, location: r.url } });
});
