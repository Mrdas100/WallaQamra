import QRCode from "qrcode";
import { route } from "@/lib/api";
import { env } from "@/lib/env";
import { customerFromRequest } from "@/lib/card-auth";
import { issueQrToken } from "@/modules/qr";

// QR حيّ لصفحة العميل: يتجدد كل ~دقيقة ولا يحتوي الجوال
export const GET = route<{ id: string }>({ name: "card-qr", rate: { limit: 60, windowSec: 60 } }, async ({ req, params }) => {
  const c = await customerFromRequest(req, params.id);
  const ttl = env.qrLiveTtlSeconds;
  const token = issueQrToken(c.id, ttl);
  const svg = await QRCode.toString(token, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { svg, expiresInSeconds: ttl, refreshInSeconds: Math.max(15, ttl - 30) };
});
