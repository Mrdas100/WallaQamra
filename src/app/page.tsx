import RegisterForm from "./register-form";

export default function Home() {
  return (
    <main className="wrap">
      <div className="brandbar">
        <img src="/icon-192.png" alt="" />
        <h1>شاهي قمرا</h1>
      </div>
      <div className="card" aria-hidden="true">
        <div className="top">
          <span className="name">بطاقة الولاء</span>
          <span className="chip" />
        </div>
        <span className="moon" />
        <div>
          <div className="balance">
            0<small>نقطة</small>
          </div>
          <div className="small">اجمع النقاط مع كل طلب واستبدلها بمكافآت</div>
        </div>
      </div>
      <section className="panel stack">
        <h2>سجّل واحصل على بطاقتك</h2>
        <RegisterForm />
      </section>
      <p className="muted small">
        لا نرسل رسائل SMS ولا نطلب موقعك. بياناتك تُستخدم فقط لبطاقة الولاء.
      </p>
    </main>
  );
}
