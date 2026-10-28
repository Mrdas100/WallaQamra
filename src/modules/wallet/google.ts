import { createSign } from "node:crypto";
import type { WalletPass } from "@prisma/client";
import { env } from "@/lib/env";
import { buildCardModel, markQrIssued, owedText, renderRelevantText, unitLabel, unitWord, type CardModel } from "./card";

// Google Wallet: Loyalty Class/Object عبر REST API مع توقيع JWT يدوياً (بدون مكتبات ثقيلة).

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

export function signJwt(claims: Record<string, unknown>, privateKeyPem: string): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(privateKeyPem).toString("base64url")}`;
}

export const classId = () => `${env.google.issuerId}.${env.google.classSuffix}`;
export const objectId = (serial: string) => `${env.google.issuerId}.${serial.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export function buildGoogleClass(businessName: string) {
  return {
    id: classId(),
    issuerName: businessName,
    programName: `ولاء ${businessName}`,
    programLogo: {
      sourceUri: { uri: `${env.appUrl}/google-logo.png` },
      contentDescription: { defaultValue: { language: "ar", value: businessName } },
    },
    hexBackgroundColor: "#5c1a28",
    heroImage: {
      sourceUri: { uri: `${env.appUrl}/card-hero.png` },
      contentDescription: { defaultValue: { language: "ar", value: businessName } },
    },
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    countryCode: "SA",
  };
}

/** صورة الأختام بتصميم لوحة الإدارة المنشور (البصمة في الرابط تجعل Google يجلب الصورة الجديدة بعد النشر) */
export function googleStripUrl(m: CardModel): string {
  const filled = Math.max(0, Math.min(m.nextRewardCost, m.balance));
  return `${env.appUrl}/wallet-art/${m.businessId}/${m.designVersion}/${m.nextRewardCost}-${filled}.png`;
}

export function buildGoogleObject(m: CardModel) {
  const word = unitWord(m.unit);
  return {
    id: objectId(m.serial),
    classId: classId(),
    state: "ACTIVE",
    hexBackgroundColor: m.design.colors.bg,
    accountId: m.customerId,
    accountName: m.customerName,
    loyaltyPoints: { label: unitLabel(m.unit), balance: { int: m.balance } },
    secondaryLoyaltyPoints: { label: "المستوى", balance: { string: m.tierLabel } },
    barcode: { type: "QR_CODE", value: m.qrToken, alternateText: "امسح عند الكاشير" },
    ...(m.stampStrip
      ? {
          imageModulesData: [
            {
              id: "stamps",
              mainImage: {
                sourceUri: { uri: googleStripUrl(m) },
                contentDescription: {
                  defaultValue: { language: "ar", value: `${Math.min(m.balance, m.nextRewardCost)} من ${m.nextRewardCost} أكواب` },
                },
              },
            },
          ],
        }
      : {}),
    textModulesData: [
      {
        id: "next",
        header: "المكافأة القادمة",
        body: m.remainingToReward > 0 ? `باقي ${m.remainingToReward} ${word}` : "لديك مكافأة متاحة 🎉",
      },
      ...(m.owed > 0 ? [{ id: "owed", header: "تنبيه", body: owedText(m) }] : []),
      ...(m.offerText ? [{ id: "offer", header: "العرض", body: m.offerText }] : []),
      ...(m.noticeText ? [{ id: "notice", header: "تنبيه", body: m.noticeText }] : []),
    ],
    linksModuleData: {
      uris: [{ id: "card", uri: m.cardUrl, description: "بطاقتي وسجل الحركات" }],
    },
    // إشعارات القرب: الجوال يتحقق من المسافة بنفسه، والتطبيق لا يستقبل موقع العميل
    merchantLocations: m.locations.slice(0, 10).map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
    // نص القرب (للتوثيق داخل البطاقة؛ Google يعرض اسم المحل عند القرب)
    infoModuleData: m.locations[0]
      ? { labelValueRows: [{ columns: [{ label: "قريب منك", value: renderRelevantText(m.locations[0].relevantText, m) }] }] }
      : undefined,
  };
}

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const assertion = signJwt(
    { iss: env.google.serviceAccountEmail, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    env.google.serviceAccountKeyPem,
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

async function gapi(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let classEnsured = false;

export async function ensureGoogleClass(businessName: string): Promise<void> {
  if (classEnsured || env.google.devMode) return;
  const id = encodeURIComponent(classId());
  const get = await gapi("GET", `/loyaltyClass/${id}`);
  if (get.status === 404) {
    const ins = await gapi("POST", "/loyaltyClass", buildGoogleClass(businessName));
    if (!ins.ok && ins.status !== 409) throw new Error(`Google class insert ${ins.status}: ${await ins.text()}`);
  } else if (get.ok) {
    await gapi("PATCH", `/loyaltyClass/${id}`, buildGoogleClass(businessName));
  } else {
    throw new Error(`Google class get ${get.status}: ${(await get.text()).slice(0, 300)}`);
  }
  classEnsured = true;
}

/** رابط "أضف إلى Google Wallet" (JWT موقّع يحتوي كائن الولاء كاملاً) */
export async function googleSaveUrl(pass: WalletPass, now = new Date()) {
  const model = await buildCardModel(pass, now);
  const object = buildGoogleObject(model);
  if (env.google.devMode) return { devMode: true as const, object, url: null };
  await ensureGoogleClass(model.businessName);
  await markQrIssued(pass.id, now);
  const jwt = signJwt(
    {
      iss: env.google.serviceAccountEmail,
      aud: "google",
      typ: "savetowallet",
      origins: [env.appUrl],
      payload: { loyaltyObjects: [object] },
    },
    env.google.serviceAccountKeyPem,
  );
  return { devMode: false as const, object, url: `https://pay.google.com/gp/v/save/${jwt}` };
}

/** تحديث كائن الولاء (الرصيد/QR/المواقع/العرض) + رسالة Wallet مع إشعار عند الحاجة */
export async function syncGooglePass(pass: WalletPass, opts: { message: string | null }, now = new Date()): Promise<void> {
  const model = await buildCardModel(pass, now);
  if (env.google.devMode) {
    console.info(`[google:dev] update skipped for ${pass.serial} (balance ${model.balance})`);
    return;
  }
  const id = encodeURIComponent(objectId(pass.serial));
  const body: Record<string, unknown> = { ...buildGoogleObject(model), notifyPreference: "NOTIFY_ON_UPDATE" };
  if (opts.message) body.messages = []; // نُبقي رسالة واحدة حديثة فقط (الحد 10)
  const res = await gapi("PATCH", `/loyaltyObject/${id}`, body);
  if (res.status === 404) return; // العميل لم يحفظ البطاقة بعد
  if (!res.ok) throw new Error(`Google patch ${res.status}: ${(await res.text()).slice(0, 200)}`);
  await markQrIssued(pass.id, now);
  if (opts.message) {
    const msg = await gapi("POST", `/loyaltyObject/${id}/addMessage`, {
      message: {
        id: `m${now.getTime()}`,
        header: model.businessName,
        body: opts.message,
        messageType: "TEXT_AND_NOTIFY",
      },
    });
    if (!msg.ok) throw new Error(`Google addMessage ${msg.status}`);
  }
}
