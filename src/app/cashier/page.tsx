import { cookies } from "next/headers";
import { pageStaff } from "@/ui/server-auth";
import { signupQrSvg } from "@/modules/signup";
import { LANG_COOKIE, parseLang } from "@/ui/i18n/cashier";
import CashierApp from "./cashier-app";

export const metadata = { title: "الكاشير — شاهي قمرا" };

export default async function CashierPage() {
  const staff = await pageStaff("CASHIER");
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return <CashierApp staffName={staff.name} role={staff.role} signupQr={await signupQrSvg()} initialLang={lang} />;
}
