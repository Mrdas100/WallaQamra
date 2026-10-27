import { route } from "@/lib/api";
import { customerFromRequest } from "@/lib/card-auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { issueRedeemCode } from "@/modules/redeem";

export const POST = route<{ id: string }>({ name: "redeem-code", rate: { limit: 10, windowSec: 600 } }, async ({ req, params }) => {
  const c = await customerFromRequest(req, params.id);
  await enforceRateLimit(`redeem-code:c:${c.id}`, 5, 600);
  const { code, expiresAt } = await issueRedeemCode(c.id, c.businessId);
  return { code, expiresAt: expiresAt.toISOString() };
});
