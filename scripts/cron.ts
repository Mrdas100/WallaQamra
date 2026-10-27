// خدمة cron على Railway (كل 5 دقائق): طابور تحديث البطاقات + تجديد QR + الصلاحية + أعياد الميلاد.
import { prisma } from "../src/lib/db";
import { runCron } from "../src/modules/maintenance";

runCron()
  .then((r) => console.log("[cron]", JSON.stringify(r)))
  .catch((e) => {
    console.error("[cron] failed", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
