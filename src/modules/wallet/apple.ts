import http2 from "node:http2";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WalletPass } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stampStripFile } from "./stamps";
import { buildCardModel, markQrIssued, renderRelevantText, unitLabel, unitWord, type CardModel } from "./card";

// Apple Wallet: توليد pass.json وتوقيعه بـ passkit-generator، وإرسال push عبر APNs.
// وضع التطوير (بدون شهادات): يُعاد pass.json للمعاينة ولا يُرسل push حقيقي.

export const APPLE_WEB_SERVICE_PATH = "/api/wallet/apple";

type Field = Record<string, unknown>;

export function buildApplePassJson(m: CardModel): Record<string, unknown> {
  const word = unitWord(m.unit);
  const next =
    m.remainingToReward > 0 ? `باقي ${m.remainingToReward} ${word}` : "لديك مكافأة متاحة 🎉";
  const front: Field[] = [];
  if (m.offerText) front.push({ key: "offer_front", label: "العرض", value: m.offerText });

  const back: Field[] = [
    {
      key: "card",
      label: "بطاقتي، سجل الحركات ورمز الاستبدال",
      value: m.cardUrl,
      attributedValue: `<a href="${m.cardUrl}">افتح صفحة البطاقة</a>`,
    },
    // حقول بقيمة ثابتة المفتاح دائماً لكي يكتشف الجهاز التغيير ويعرض الإشعار
    {
      key: "offer",
      label: "عرض شاهي قمرا",
      value: m.offerText || "لا يوجد عرض حالياً",
      ...(m.offerNotify ? { changeMessage: "%@" } : {}),
    },
    { key: "notice", label: "تنبيه", value: m.noticeText || "لا توجد تنبيهات", changeMessage: "%@" },
    {
      key: "terms",
      label: "الشروط",
      value: "النقاط تُحتسب من قيمة الطلب عند الكاشير. لا تشارك رمز الاستبدال مع أحد. الموظف لن يطلب منك أي رمز إلا عند الاستبدال.",
    },
  ];

  const locations = m.locations.slice(0, 10).map((l) => ({
    latitude: l.latitude,
    longitude: l.longitude,
    relevantText: renderRelevantText(l.relevantText, m),
  }));
  const maxDistance = m.locations.length ? Math.max(...m.locations.map((l) => l.maxDistance)) : undefined;

  return {
    formatVersion: 1,
    passTypeIdentifier: env.apple.passTypeId,
    teamIdentifier: env.apple.teamId,
    serialNumber: m.serial,
    organizationName: m.businessName,
    description: `بطاقة ولاء ${m.businessName}`,
    logoText: m.businessName,
    foregroundColor: "rgb(245, 238, 226)",
    backgroundColor: "rgb(92, 26, 40)",
    labelColor: "rgb(200, 169, 126)",
    webServiceURL: `${env.appUrl}${APPLE_WEB_SERVICE_PATH}`,
    authenticationToken: m.authToken,
    sharingProhibited: true,
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: m.qrToken,
        messageEncoding: "iso-8859-1",
        altText: "امسح عند الكاشير",
      },
    ],
    ...(locations.length ? { locations, maxDistance } : {}),
    storeCard: m.stampStrip
      ? {
          // الأكواب مرسومة على الشريط، فالرصيد يظهر في الأعلى بدل أن يغطي الصورة
          headerFields: [
            {
              key: "balance",
              label: unitLabel(m.unit),
              value: `${Math.max(0, Math.min(m.balance, m.nextRewardCost))}/${m.nextRewardCost}`,
              changeMessage: `أختامك الآن %@`,
            },
          ],
          primaryFields: [],
          secondaryFields: [
            { key: "member", label: "العضو", value: m.customerName },
            { key: "next", label: "الكوب المجاني", value: next },
          ],
          auxiliaryFields: front,
          backFields: back,
        }
      : {
      headerFields: [{ key: "tier", label: "المستوى", value: m.tierLabel, changeMessage: "أصبحت في المستوى %@" }],
      primaryFields: [
        {
          key: "balance",
          label: unitLabel(m.unit),
          value: m.balance,
          changeMessage: `رصيدك الآن %@ ${word}`,
        },
      ],
      secondaryFields: [
        { key: "member", label: "العضو", value: m.customerName },
        { key: "next", label: "المكافأة القادمة", value: next },
      ],
      auxiliaryFields: front,
      backFields: back,
    },
  };
}

let imageCache: Record<string, Buffer> | null = null;

async function passImages(): Promise<Record<string, Buffer>> {
  if (imageCache) return imageCache;
  const dir = path.join(process.cwd(), "wallet-assets", "apple");
  const names = ["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "logo@3x.png", "strip.png", "strip@2x.png", "strip@3x.png"];
  const entries = await Promise.all(names.map(async (n) => [n, await readFile(path.join(dir, n))] as const));
  imageCache = Object.fromEntries(entries);
  return imageCache;
}

const stripCache = new Map<string, Buffer>();

/** وضع الأختام: شريط الأكواب حسب الرصيد بدل الشريط العام */
async function stampStripImages(m: CardModel): Promise<Record<string, Buffer>> {
  if (m.unit !== "STAMP") return {};
  const out: Record<string, Buffer> = {};
  for (const scale of [1, 2, 3] as const) {
    const file = stampStripFile(m.nextRewardCost, m.balance, scale);
    if (!file) return {};
    let buf = stripCache.get(file);
    if (!buf) {
      buf = await readFile(path.join(process.cwd(), "public", "stamps", file));
      stripCache.set(file, buf);
    }
    out[scale === 1 ? "strip.png" : `strip@${scale}x.png`] = buf;
  }
  return out;
}

export type ApplePassResult =
  | { devMode: false; buffer: Buffer; lastModified: Date }
  | { devMode: true; passJson: Record<string, unknown>; lastModified: Date };

export async function generateApplePass(pass: WalletPass, now = new Date()): Promise<ApplePassResult> {
  const model = await buildCardModel(pass, now);
  const passJson = buildApplePassJson(model);
  await markQrIssued(pass.id, now);
  const lastModified = pass.contentUpdatedAt;
  if (env.apple.devMode) return { devMode: true, passJson, lastModified };

  const { PKPass } = await import("passkit-generator");
  const pk = new PKPass(
    { ...(await passImages()), ...(await stampStripImages(model)), "pass.json": Buffer.from(JSON.stringify(passJson)) },
    {
      wwdr: env.apple.wwdrPem,
      signerCert: env.apple.signerCertPem,
      signerKey: env.apple.signerKeyPem,
      signerKeyPassphrase: env.apple.signerKeyPassphrase || undefined,
    },
  );
  return { devMode: false, buffer: pk.getAsBuffer(), lastModified };
}

/** APNs: payload فارغ {} والـ topic هو Pass Type ID — الجهاز بعدها يطلب أحدث نسخة من البطاقة */
async function sendApns(tokens: string[]): Promise<{ token: string; status: number }[]> {
  const client = http2.connect(`https://${env.apple.apnsHost}`, {
    cert: env.apple.signerCertPem,
    key: env.apple.signerKeyPem,
    passphrase: env.apple.signerKeyPassphrase || undefined,
  });
  try {
    return await Promise.all(
      tokens.map(
        (token) =>
          new Promise<{ token: string; status: number }>((resolve, reject) => {
            const req = client.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              "apns-topic": env.apple.passTypeId,
              "content-type": "application/json",
            });
            let status = 0;
            req.on("response", (h) => {
              status = Number(h[":status"]);
            });
            req.on("data", () => undefined);
            req.on("end", () => resolve({ token, status }));
            req.on("error", reject);
            req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
            req.end("{}");
          }),
      ),
    );
  } finally {
    client.close();
  }
}

export async function pushApplePass(pass: WalletPass): Promise<void> {
  const devices = await prisma.deviceRegistration.findMany({ where: { walletPassId: pass.id } });
  if (devices.length === 0) return;
  if (env.apple.devMode) {
    console.info(`[apple:dev] push skipped for pass ${pass.serial} (${devices.length} devices)`);
    return;
  }
  const tokens = [...new Set(devices.map((d) => d.pushToken))];
  const results = await sendApns(tokens);
  const gone = results.filter((r) => r.status === 410).map((r) => r.token);
  if (gone.length) {
    await prisma.deviceRegistration.deleteMany({ where: { walletPassId: pass.id, pushToken: { in: gone } } });
  }
  const failed = results.filter((r) => r.status !== 200 && r.status !== 410);
  if (failed.length) throw new Error(`APNs failed: ${failed.map((f) => f.status).join(",")}`);
}
