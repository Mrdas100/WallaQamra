import { pageStaff } from "@/ui/server-auth";
import { signupQrSvg, signupUrl } from "@/modules/signup";
import PrintButton from "./print-button";

export const metadata = { title: "رمز التسجيل — شاهي قمرا" };

export default async function SignupQrPage() {
  await pageStaff("CASHIER");
  const svg = await signupQrSvg();
  return (
    <main className="wrap stack poster">
      <div className="brandbar">
        <img src="/icon-192.png" alt="" />
        <h1>شاهي قمرا</h1>
      </div>
      <h2>امسح الرمز وسجّل في بطاقة الولاء</h2>
      <p>اجمع النقاط مع كل طلب، وأضف بطاقتك إلى Apple Wallet أو Google Wallet.</p>
      <div className="poster-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="muted small" dir="ltr">{signupUrl()}</p>
      <div className="row no-print">
        <PrintButton />
        <a href="/cashier">رجوع للكاشير</a>
      </div>
    </main>
  );
}
