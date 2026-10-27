import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang } from "@/ui/i18n/cashier";
import LoginForm from "./login-form";

export const metadata = { title: "دخول الموظفين — شاهي قمرا" };

export default async function LoginPage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return <LoginForm initialLang={lang} />;
}
