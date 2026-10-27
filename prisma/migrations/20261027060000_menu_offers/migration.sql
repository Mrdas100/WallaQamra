-- عروض مبنية على منيو شاهي قمرا (27-10-2026). كلها قابلة للتعديل أو الإيقاف من لوحة الإدارة.

-- أرخص كوب في المنيو 6 ريال: لا يُقبل عدد أكواب أكبر من قيمة الطلب ÷ 6
UPDATE "Settings" SET "minStampAmountHalalas" = 600 WHERE "programMode" = 'STAMPS';

UPDATE "Reward" SET "description" = 'أي مشروب ساخن حتى 8 ريال، أو ادفع الفرق', "sortOrder" = 1
WHERE "unit" = 'STAMP' AND "name" = 'كوب مجاني';

INSERT INTO "Reward" ("id", "businessId", "name", "description", "cost", "unit", "minTier", "active", "sortOrder", "updatedAt")
SELECT 'rw' || substr(md5(random()::text || b."id" || r.name), 1, 23), b."id", r.name, r.description, r.cost, 'STAMP', 'BRONZE', true, r.sort, now()
FROM "Business" b
CROSS JOIN (VALUES
  ('ابريق شاهي مجاني', 'ابريق شاهي بأي نوع', 10, 2),
  ('خلية أو بانكيك مجاني', 'أي صنف من قسم خلية النحل', 15, 3),
  ('بوكس شاهي 1 لتر مجاني', 'Qamra Tea Box للطلبات الخارجية', 20, 4)
) AS r(name, description, cost, sort);

-- ساعة قمرا: أختام مضاعفة من الأحد للأربعاء 3 إلى 6 العصر، لتعبئة الأوقات الهادئة. تبدأ موقوفة حتى يفعّلها المالك.
INSERT INTO "Campaign" ("id", "businessId", "name", "multiplierPct", "startsAt", "endsAt", "startMinute", "endMinute", "daysMask", "active")
SELECT 'cp' || substr(md5(random()::text || b."id"), 1, 23), b."id", 'ساعة قمرا: أختام مضاعفة', 200, now(), now() + interval '90 days', 900, 1080, 15, false
FROM "Business" b;
