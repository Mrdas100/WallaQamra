// تهيئة أولية آمنة لإعادة التشغيل: المحل + الإعدادات + حساب الأدمن الأول + مكافآت افتراضية.
// الاستخدام: ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run db:seed
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const slug = process.env.BUSINESS_SLUG || "shahi-qamra";
  const business = await prisma.business.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: process.env.BUSINESS_NAME || "شاهي قمرا",
      // بطاقة أختام: 5 أكواب والسادس مجاناً
      settings: { create: { programMode: "STAMPS", stampsPerReward: 5, minStampAmountHalalas: 300 } },
    },
  });

  const username = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (username && !password) {
    console.warn(`ADMIN_PASSWORD is not set — skipping admin "${username}"`);
  } else if (username) {
    if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
    const existing = await prisma.staff.findUnique({ where: { businessId_username: { businessId: business.id, username } } });
    if (!existing) {
      await prisma.staff.create({
        data: { businessId: business.id, username, name: "المدير العام", role: "ADMIN", passwordHash: await hashPassword(password) },
      });
      console.log(`Created admin "${username}"`);
    } else {
      console.log(`Admin "${username}" already exists (password unchanged)`);
    }
  }

  if ((await prisma.reward.count({ where: { businessId: business.id } })) === 0) {
    await prisma.reward.createMany({
      data: [
        { businessId: business.id, name: "كوب مجاني", description: "السادس علينا بعد 5 أكواب", cost: 5, unit: "STAMP", sortOrder: 1 },
      ],
    });
    console.log("Created default rewards");
  }
  console.log(`Business ready: ${business.name} (${business.slug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
