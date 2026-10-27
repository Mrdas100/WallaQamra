# ولاء شاهي قمرا

تطبيق ولاء خفيف ومستقل لكافيه **شاهي قمرا**: العميل يسجّل باسمه وجواله ويحصل على بطاقة Apple Wallet / Google Wallet بشكل البطاقات البنكية، وكل طلب يضيفه الكاشير يحدّث رصيد البطاقة على جوال العميل تلقائياً (push).

> v1 لمحل واحد، وكل الجداول تحمل `businessId` للتوسع لاحقاً.

## التقنية

- Next.js 16 (App Router) + TypeScript + Prisma 6 + PostgreSQL — modular monolith
- `src/modules/*` منطق الأعمال (ledger، الطلبات، الاستبدال، المكافآت، المحافظ...)، `src/app/api/*` الـ API، `src/app/*` الواجهات
- Apple Wallet: `passkit-generator` + PassKit Web Service كامل + APNs (HTTP/2 مدمج في Node)
- Google Wallet: Loyalty Class/Object عبر REST مع توقيع JWT يدوي (بدون SDK)
- طابور `WalletSyncJob` يُعالَج فوراً بعد كل عملية، وما يفشل يعاد بمحاولات تصاعدية (30ث، 1د، 2د... حتى 6 ساعات، 8 محاولات) عبر خدمة cron على Railway
- واجهات عربية RTL، جوال أولاً، CSS بسيط بدون مكتبات واجهات

## منع التلاعب (وأين يُطبَّق)

| القاعدة | التطبيق | الاختبار |
|---|---|---|
| لا يوجد حقل رصيد؛ الرصيد = مجموع `LedgerEntry` | `modules/ledger.ts` | `tests/ledger.test.ts` |
| ممنوع UPDATE/DELETE/TRUNCATE على الحركات و`AuditLog` و`Redemption` | trigger في `prisma/migrations/*_append_only_guards` | `ledger.test.ts` |
| التصحيح بحركة عكسية مع سبب (مرة واحدة لكل حركة) | `reverseEntry` + `reversesEntryId @unique` + CHECK في القاعدة | `ledger.test.ts` |
| رقم الطلب فريد + idempotency key | `Order @@unique` + أقفال `pg_advisory_xact_lock` | `earn.test.ts` (يشمل طلبات متزامنة) |
| النقاط تُحسب في السيرفر؛ أي حقل `points` من الكاشير يُرفض | `computeEarn` + zod `.strict()` | `earn.test.ts` |
| حفظ الموظف والوقت والجهاز وIP لكل عملية | `Actor` + كوكي `did` + `X-Real-IP` | `earn.test.ts` |
| سقف يومي (عمليات ونقاط) + فترة انتظار | `orders.ts` (حسب يوم الرياض) | `earn.test.ts` |
| QR موقّع قصير العمر يتجدد ولا يحتوي الجوال | `modules/qr.ts` (HMAC)، تجديد في cron وQR حيّ كل ~60ث | `qr.test.ts`, `wallet.test.ts` |
| كود استبدال لمرة واحدة (دقيقتان) + قفل يتضاعف | `modules/redeem.ts` (الكود مخزّن كهاش فقط) | `redeem.test.ts` |
| الجوال مقنّع للكاشير ولا يظهر أي رمز تحقق | `cashierView` | `qr.test.ts`, `redeem.test.ts` |
| المرتجع يعكس النقاط (ومكافآت أول طلب) تلقائياً | `refundOrder` | `earn.test.ts` |
| الإضافة اليدوية: مدير + سبب إجباري + حد بالوردية | `modules/manual.ts` | `manual.test.ts` |
| Rate limiting على كل الـ API + brute force للدخول | `lib/ratelimit.ts` (Postgres)، `modules/auth.ts` (قفل يتضاعف بالمستخدم وIP) | `security.test.ts`, `auth.test.ts` |
| أدوار CASHIER / MANAGER / ADMIN في السيرفر | `lib/api.ts` → `requireRole`، وفحص ثانٍ داخل الوحدات | `security.test.ts` |
| تنبيهات: إضافات متكررة لنفس العميل، استبدالات متتالية، خارج الدوام | `modules/alerts.ts` | `alerts.test.ts` |
| AuditLog للإعدادات والأدوار | `modules/admin.ts` | `alerts.test.ts`, `auth.test.ts` |
| CSP صارم بـ nonce + `no-store` على الإدارة | `src/proxy.ts`, `lib/security-headers.ts` | `security.test.ts` |
| CSRF | كوكي `SameSite=Strict` + فحص `Origin` | `security.test.ts` |

## ميزات الولاء

- **بطاقة أختام** (الافتراضي: 5 أكواب والسادس مجاناً، ختم لكل كوب يدخله الكاشير مع سقف للطلب وتحقق أن المبلغ يغطي الأكواب) أو **نقاط** بنسبة من المبلغ — التبديل من الإعدادات
- الهوية: عنابي وبيج. صور البطاقات وشريط الأختام تُولَّد بـ `python3 scripts/gen-assets.py`
- **مستويات** برونزي/فضي/ذهبي حسب إنفاق آخر 365 يوماً، بمضاعِف نقاط لكل مستوى، ومكافآت مقصورة على مستوى
- **كتالوج مكافآت** يديره الأدمن
- **انتهاء صلاحية النقاط** (FIFO بحركة `EXPIRY` جديدة) مع تنبيه على البطاقة قبل الانتهاء
- **حملات نقاط مضاعفة** بفترة وأيام ونافذة ساعات (مثلاً ساعات الهدوء)
- **مكافأة تسجيل** و**مكافأة إحالة** للطرفين تُمنحان بعد أول طلب حقيقي (وتُعكسان إذا أُرجع الطلب)، مع منع الإحالة من نفس الجهاز/الشبكة وسقف شهري
- **هدية عيد الميلاد** مرة في السنة (التاريخ اختياري ويُضاف مرة واحدة فقط)
- **صفحة العميل**: الرصيد، QR حيّ، رمز الاستبدال، الحركات، المكافآت، رابط الدعوة، إيقاف العروض
- **تقارير** (النشطون، معدل العودة، الممنوح والمستبدل، أفضل الساعات) و**تصدير CSV**

## تصميم بطاقة الولاء (لوحة الإدارة > تصميم بطاقة الولاء)

- 6 قوالب بتخطيطات مختلفة: Royal (إطار)، Classic (تذكرة)، Night (قوس)، Nature (شبكة)، Glass (زجاجي)، Minimal (عداد).
- ألوان HEX، خط، استدارة، شعار وخلفية مرفوعة، نصوص بمتغيرات `{remaining}` `{goal}` `{balance}` `{name}`.
- مكتبة أختام: كوب واقعي PNG، ثلاثي الأبعاد، مسطح، خطي، هلال، نجمة، ختم دائري، أو صورك (فارغ/مكتمل/مكافأة).
- سلايدات: الأختام وQR (أساسي ودائماً أولاً) + المكافأة + العروض + صفحات مخصصة (حتى 8)، ولكل سلايد قالب.
- المسودة (`CardDesign` DRAFT) منفصلة عن المنشور (PUBLISHED). النشر بتأكيد ويُسجّل في سجل التدقيق.
- الصور تُخزّن في قاعدة البيانات (`DesignAsset`) وتُخدم من `/media/<id>`: PNG/JPG/WebP فقط بفحص المحتوى، حتى 1.5MB، بدون SVG.
- السلايدات والحركات في صفحة الويب فقط؛ بطاقات Apple/Google Wallet لم تتغير.
- للتراجع عن الهجرة يدوياً: `prisma/migrations/20261027070000_card_design/down.sql`.
- صور الكوب الواقعي تُولّد بـ `python3 scripts/gen-assets.py` (`public/library`). الخطوط عربية مرخّصة OFL عبر `@fontsource`.

## إشعارات Wallet الجغرافية والعروض

- جدول `BranchLocation` يُدار من لوحة الأدمن (حتى 10 مواقع فعّالة). أي تعديل يُنشئ `WalletSyncJob` لكل بطاقة.
- Apple: `locations` + `relevantText` (يدعم `{points}` و`{name}`) + `maxDistance`. Google: `merchantLocations`.
- **لا يُجمع موقع العميل ولا يُخزَّن**: الجوال يتحقق من القرب بنفسه، و`Permissions-Policy` يمنع طلب الموقع.
- تغيير `offerMessage` من الإعدادات يرسل push مع `changeMessage` (Apple) ورسالة `TEXT_AND_NOTIFY` (Google)، مع: حد أسبوعي لكل عميل، إمكانية الإيقاف من صفحة العميل، ولا رسائل بين 23:00 و08:00 بتوقيت الرياض (تؤجَّل للصباح).

## التشغيل محلياً

```bash
cp .env.example .env              # عدّل DATABASE_URL
npm install
npx prisma migrate deploy
ADMIN_USERNAME=admin ADMIN_PASSWORD='كلمة-مرور-قوية-12+' npm run db:seed
npm run dev                       # http://localhost:3000
```

- `/` تسجيل العميل · `/login` دخول الموظفين · `/cashier` الكاشير · `/admin` الإدارة
- بدون شهادات Apple/Google يعمل **وضع التطوير**: زر Wallet يعرض معاينة `pass.json` / كائن Google، ولا يُرسل push.

### الاختبارات و`npm run check`

```bash
createdb loyalty_test             # قاعدة اختبار منفصلة (تُمسح في كل تشغيل)
export TEST_DATABASE_URL=postgresql://postgres@localhost:5432/loyalty_test
npm run check                     # lint + typecheck + tests + build
```

خطّاف `pre-commit` (في `.githooks`) يشغّل `npm run check` قبل أي commit، ويُفعَّل تلقائياً مع `npm install`.

## النشر على Railway

### 1) المشروع والبيئتان
1. أنشئ مشروعاً جديداً على Railway واربطه بهذا المستودع.
2. أضف **PostgreSQL** للمشروع.
3. أنشئ بيئتين: `production` و`staging` (Project Settings → Environments). كل بيئة لها قاعدة بيانات ومتغيرات منفصلة تماماً.

### 2) خدمة التطبيق (web)
- مصدرها هذا المستودع (فرع main) بالإعدادات: Build `npm run build` · Pre-deploy `npx prisma migrate deploy && npm run db:seed` · Start `npm start` · Healthcheck `/api/health` · `PORT=8080`.
- Settings → Networking → Generate Domain (أو دومين خاص).
- المتغيرات (Variables) — **كل الأسرار هنا فقط**، لا شيء في الكود:
  - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
  - `APP_URL=https://<الدومين>`
  - `QR_SIGNING_SECRET`, `HASH_SALT`, `CRON_SECRET` (قيم عشوائية طويلة، **مختلفة** بين staging وproduction)
  - متغيرات Apple وGoogle أدناه
- حساب الأدمن الأول: ضع `ADMIN_USERNAME` و`ADMIN_PASSWORD` (12 حرفاً على الأقل) في متغيرات خدمة web؛ أمر ما قبل النشر يشغّل `npm run db:seed` تلقائياً وينشئ الحساب مرة واحدة فقط (ولا يغيّر كلمة المرور لاحقاً).

### 3) خدمة cron
- أضف خدمة ثانية من **نفس المستودع** وسمّها `cron`.
- الإعدادات: Build `npx prisma generate` · Start `npm run cron` · Cron schedule `*/5 * * * *` · Restart policy: Never.
- انسخ لها نفس متغيرات خدمة web (أو استخدم Shared Variables).
- تقوم بـ: إعادة محاولة مهام `WalletSyncJob` الفاشلة، تجديد QR البطاقات قبل انتهائه، انتهاء صلاحية النقاط وتنبيهاتها، هدايا أعياد الميلاد، وتنظيف جداول rate limit.
- بديل: `POST /api/cron/run` مع `Authorization: Bearer $CRON_SECRET`.

## شهادات Apple Wallet

تحتاج حساب Apple Developer (99$ سنوياً).

1. **Pass Type ID**: developer.apple.com → Certificates, IDs & Profiles → Identifiers → `+` → Pass Type IDs → مثلاً `pass.sa.shahiqamra.loyalty`.
2. **الشهادة**: من نفس الـ Identifier → Create Certificate. أنشئ CSR من Keychain Access (Certificate Assistant → Request a Certificate From a CA → Saved to disk)، ارفعه ونزّل `pass.cer`.
3. افتح `pass.cer` في Keychain، ثم صدّر الشهادة مع المفتاح كـ `pass.p12` (بكلمة مرور).
4. حوّلها إلى PEM:
   ```bash
   openssl pkcs12 -in pass.p12 -clcerts -nokeys -out signerCert.pem -legacy
   openssl pkcs12 -in pass.p12 -nocerts -out signerKey.pem -legacy   # يطلب passphrase للمفتاح
   ```
5. **WWDR**: نزّل Apple Worldwide Developer Relations **G4** من apple.com/certificateauthority ثم:
   `openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem`
6. في Railway (أسهل بصيغة base64 بسطر واحد: `base64 -w0 signerCert.pem`):
   - `APPLE_PASS_TYPE_ID` = الـ Pass Type ID
   - `APPLE_TEAM_ID` = Team ID (أعلى يمين صفحة الحساب)
   - `APPLE_SIGNER_CERT_PEM`, `APPLE_SIGNER_KEY_PEM`, `APPLE_SIGNER_KEY_PASSPHRASE`, `APPLE_WWDR_PEM`
7. نفس الشهادة تُستخدم لإرسال push عبر APNs (topic = Pass Type ID). الشهادة صالحة سنة: جدّدها قبل انتهائها.
8. Apple تتطلب HTTPS لـ `webServiceURL` (`APP_URL/api/wallet/apple`) — دومين Railway يكفي.
9. لـ staging استخدم نفس الشهادة أو Pass Type ID منفصلاً (مستحسن) حتى لا تختلط الأجهزة المسجلة.

## Google Wallet

1. pay.google.com/business/console → أنشئ **Issuer account** وانسخ **Issuer ID**.
2. Google Cloud Console → فعّل **Google Wallet API** → أنشئ **Service Account** → Keys → Add key (JSON).
3. في Wallet Console → Users → أضف بريد الـ Service Account بصلاحية Developer.
4. في Railway:
   - `GOOGLE_WALLET_ISSUER_ID`
   - `GOOGLE_SA_EMAIL` = `client_email` من ملف JSON
   - `GOOGLE_SA_PRIVATE_KEY` = `private_key` من ملف JSON (كما هو بـ `\n`، أو base64)
5. التطبيق ينشئ الـ Loyalty Class تلقائياً أول مرة. للنشر العام اطلب **Publishing access** من Wallet Console (قبلها تعمل البطاقات لحسابات الاختبار فقط).

## الأمان والتشغيل

- كل الأسرار في متغيرات Railway فقط. لا ترفع ملفات `.pem` أو `.p12` (مستبعدة في `.gitignore`).
- رابط صفحة العميل يحتوي مفتاحاً سرياً؛ المدير يستطيع إعادة إصداره من شاشة الكاشير (يُبطل القديم ويُسجَّل في AuditLog).
- تسجيل العميل بدون SMS: لا تُمنح أي نقاط عند التسجيل نفسه، فالمكافآت مرتبطة بأول طلب حقيقي عند الكاشير.
- خارج النطاق عمداً: SMS، واتساب، الطلبات، قائمة الطعام.
