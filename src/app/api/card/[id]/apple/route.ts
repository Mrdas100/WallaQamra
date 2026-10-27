import { route, NO_STORE } from "@/lib/api";
import { customerFromRequest } from "@/lib/card-auth";
import { ensurePass } from "@/modules/wallet/card";
import { generateApplePass } from "@/modules/wallet/apple";

export const GET = route<{ id: string }>({ name: "apple-pass", rate: { limit: 10, windowSec: 60 } }, async ({ req, params }) => {
  const c = await customerFromRequest(req, params.id);
  const pass = await ensurePass(c, "APPLE");
  const result = await generateApplePass(pass);
  if (result.devMode) {
    return Response.json(
      { ok: true, devMode: true, message: "وضع التطوير: لا توجد شهادة Apple، هذه معاينة pass.json", passJson: result.passJson },
      { headers: NO_STORE },
    );
  }
  return new Response(new Uint8Array(result.buffer), {
    headers: {
      ...NO_STORE,
      "content-type": "application/vnd.apple.pkpass",
      "content-disposition": `attachment; filename="shahi-qamra.pkpass"`,
      "last-modified": result.lastModified.toUTCString(),
    },
  });
});
