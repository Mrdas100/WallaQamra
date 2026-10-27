import { headers } from "next/headers";
import { getDefaultBusiness, getSettings } from "@/modules/business";
import { getPublishedDesign } from "@/modules/design/service";
import { signupQrSvg } from "@/modules/signup";
import LoyaltyCard from "@/ui/card/loyalty-card";
import RegisterForm from "./register-form";

export const dynamic = "force-dynamic";

export default async function Home() {
  const business = await getDefaultBusiness();
  const s = await getSettings(business.id);
  const stamps = s.programMode === "STAMPS";
  const [design, qr] = await Promise.all([getPublishedDesign(business.id), signupQrSvg()]);
  const nonce = (await headers()).get("x-nonce") ?? "";
  // الصفحة الرئيسية تعرض سلايد الأختام فقط كمثال
  const sample = { ...design, slides: design.slides.filter((x) => x.kind === "stamps") };
  return (
    <main className="wrap stack">
      <div className="brandbar">
        <img src="/icon-192.png" alt="" />
        <h1>{business.name}</h1>
      </div>
      <div className="hero">
        {stamps ? (
          <>
            <h2>اشرب {s.stampsPerReward} أكواب، وال{ordinal(s.stampsPerReward + 1)} علينا</h2>
            <p>ختم مع كل كوب، والبطاقة في محفظة جوالك</p>
          </>
        ) : (
          <>
            <h2>اجمع النقاط مع كل طلب</h2>
            <p>واستبدلها بمكافآت من {business.name}</p>
          </>
        )}
      </div>
      <LoyaltyCard
        design={sample}
        nonce={nonce}
        label="مثال على بطاقة الولاء"
        data={{
          name: "اسمك هنا",
          tierLabel: null,
          mode: s.programMode,
          balance: stamps ? Math.min(3, s.stampsPerReward - 1) : 0,
          goal: stamps ? s.stampsPerReward : s.rewardThreshold,
          unitWord: stamps ? "ختم" : "نقطة",
          reward: null,
        }}
        qr={<span dangerouslySetInnerHTML={{ __html: qr }} />}
      />
      <section className="panel stack">
        <h2>سجّل واحصل على بطاقتك</h2>
        <RegisterForm />
      </section>
      <p className="muted small">لا نرسل رسائل SMS ولا نطلب موقعك. بياناتك تُستخدم فقط لبطاقة الولاء.</p>
    </main>
  );
}

const ORDINALS = ["", "أول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع", "عاشر", "حادي عشر"];
function ordinal(n: number): string {
  return ORDINALS[n] ?? String(n);
}
