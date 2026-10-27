import { route } from "@/lib/api";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { runCron } from "@/modules/maintenance";

// بديل HTTP لخدمة cron (الافتراضي: npm run cron في خدمة Railway منفصلة)
export const POST = route({ name: "cron", rate: { limit: 6, windowSec: 60 } }, async ({ req }) => {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.cronSecret}`)) throw new AppError("UNAUTHORIZED", "غير مصرح");
  return runCron();
});
