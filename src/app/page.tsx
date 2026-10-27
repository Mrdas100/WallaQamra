import { getDefaultBusiness, getSettings } from "@/modules/business";
import { stampStripFile } from "@/modules/wallet/stamps";
import RegisterForm from "./register-form";

export const dynamic = "force-dynamic";

export default async function Home() {
  const business = await getDefaultBusiness();
  const s = await getSettings(business.id);
  const stamps = s.programMode === "STAMPS";
  const strip = stamps ? stampStripFile(s.stampsPerReward, 0, 2) : null;
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
      <div className="card" aria-hidden="true">
        <div className="top">
          <span className="name">بطاقة الولاء</span>
          <span className="tier">{business.name}</span>
        </div>
        {strip ? (
          <img className="stamps" src={`/stamps/${strip}`} alt="" />
        ) : (
          <>
            <span className="moon" />
            <div className="balance">
              0<small>نقطة</small>
            </div>
          </>
        )}
        <div className="small">{stamps ? `0 من ${s.stampsPerReward} أكواب` : "اجمع النقاط واستبدلها بمكافآت"}</div>
      </div>
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
