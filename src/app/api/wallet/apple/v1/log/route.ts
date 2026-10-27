import { route } from "@/lib/api";

export const POST = route({ name: "apple-log", rate: { limit: 20, windowSec: 60 } }, async ({ req }) => {
  const body = (await req.json().catch(() => ({}))) as { logs?: unknown };
  if (Array.isArray(body.logs)) {
    for (const line of body.logs.slice(0, 20)) console.warn("[apple-wallet]", String(line).slice(0, 500));
  }
  return new Response(null, { status: 200 });
});
