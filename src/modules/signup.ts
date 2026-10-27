import QRCode from "qrcode";
import { env } from "@/lib/env";

/** رابط صفحة تسجيل العملاء (الصفحة الرئيسية) */
export function signupUrl(): string {
  return `${env.appUrl}/`;
}

/** رمز QR لصفحة التسجيل، يُعرض في الكاونتر وشاشة الكاشير */
export function signupQrSvg(): Promise<string> {
  return QRCode.toString(signupUrl(), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
