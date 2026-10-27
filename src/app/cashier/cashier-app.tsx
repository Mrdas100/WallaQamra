"use client";

import { useCallback, useState } from "react";
import { api, ApiError, newKey } from "@/ui/api";
import Scanner from "@/ui/scanner";

interface CustomerView {
  id: string;
  name: string;
  maskedPhone: string;
  unit: "POINT" | "STAMP";
  balance: number;
  tierLabel: string;
  rewards: { id: string; name: string; cost: number; eligible: boolean }[];
}

type Msg = { type: "ok" | "error" | "warn"; text: string } | null;

export default function CashierApp({ staffName, role, signupQr }: { staffName: string; role: string; signupQr: string }) {
  const [customer, setCustomer] = useState<CustomerView | null>(null);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const isManager = role === "MANAGER" || role === "ADMIN";

  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setMsg(null);
    try {
      return await fn();
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const lookup = useCallback(async (body: { qr?: string; phone?: string }) => {
    setBusy(true);
    setMsg(null);
    try {
      setCustomer(await api<CustomerView>("/api/cashier/lookup", { body }));
      setShowSignup(false);
    } catch (e) {
      // رقم غير مسجل: نعرض رمز التسجيل ليمسحه العميل بجواله
      if (body.phone && e instanceof ApiError && e.code === "NOT_FOUND") {
        setShowSignup(true);
        setMsg({ type: "warn", text: "الرقم غير مسجل. خلّ العميل يمسح الرمز بجواله ويسجّل، ثم ابحث برقمه مرة ثانية." });
      } else {
        setMsg({ type: "error", text: (e as Error).message });
      }
    } finally {
      setBusy(false);
    }
  }, []);

  /** إعادة تحميل بيانات العميل بعد كل عملية (الرصيد والمكافآت المتاحة) */
  const reload = async (id: string, text: string) => {
    try {
      setCustomer(await api<CustomerView>("/api/cashier/lookup", { body: { customerId: id } }));
    } catch {
      /* يبقى العرض السابق */
    }
    setMsg({ type: "ok", text });
  };

  return (
    <main className="wrap stack">
      <div className="row spread">
        <div className="brandbar">
          <img src="/icon-192.png" alt="" />
          <h1>الكاشير</h1>
        </div>
        <div className="row small">
          <span className="muted">{staffName}</span>
          {isManager && <a href="/admin">الإدارة</a>}
          <button className="btn-ghost btn-sm" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); location.href = "/login"; }}>
            خروج
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`} role="status">{msg.text}</div>}

      {!customer ? (
        <section className="panel stack">
          <h2>العميل</h2>
          <Scanner onResult={(qr) => lookup({ qr })} />
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              lookup({ phone });
            }}
          >
            <label htmlFor="ph">بحث برقم الجوال</label>
            <div className="row">
              <input id="ph" inputMode="numeric" placeholder="05XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button disabled={busy || phone.length < 9}>بحث</button>
            </div>
          </form>
          {showSignup ? (
            <div className="stack">
              <h3>تسجيل عميل جديد</h3>
              <div className="signup-qr" dangerouslySetInnerHTML={{ __html: signupQr }} />
              <p className="muted small">يمسح العميل الرمز بكاميرا جواله، يسجّل اسمه ورقمه، ويضيف البطاقة إلى محفظته.</p>
              <div className="row">
                <button className="btn-ghost btn-sm" onClick={() => setShowSignup(false)}>إخفاء</button>
                <a href="/signup-qr" target="_blank">نسخة للطباعة</a>
              </div>
            </div>
          ) : (
            <button className="btn-ghost" onClick={() => setShowSignup(true)}>عميل جديد؟ اعرض رمز التسجيل</button>
          )}
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="row spread">
              <div>
                <b>{customer.name}</b> <span className="tag">{customer.tierLabel}</span>
                <div className="muted small ltr">{customer.maskedPhone}</div>
              </div>
              <div>
                <b className="balance-inline">{customer.balance}</b> {customer.unit === "STAMP" ? "ختم" : "نقطة"}
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => { setCustomer(null); setPhone(""); setMsg(null); }}>
              عميل آخر
            </button>
          </section>

          <EarnForm
            customer={customer}
            busy={busy}
            run={run}
            onDone={(balance, points) => reload(customer.id, `تمت إضافة ${points} — الرصيد الآن ${balance}`)}
          />

          <RedeemForm
            customer={customer}
            busy={busy}
            run={run}
            onDone={(balance) => reload(customer.id, `تم الاستبدال — الرصيد الآن ${balance}`)}
          />

          {isManager && (
            <ManagerTools
              customer={customer}
              busy={busy}
              run={run}
              onDone={(balance) => reload(customer.id, `تم — الرصيد الآن ${balance}`)}
            />
          )}
        </>
      )}

      <RefundForm busy={busy} run={run} onDone={(pts) => setMsg({ type: "ok", text: `تم المرتجع وخصم ${pts} تلقائياً` })} />
    </main>
  );
}

type Run = <T>(fn: () => Promise<T>) => Promise<T | null>;

function EarnForm({ customer, busy, run, onDone }: { customer: CustomerView; busy: boolean; run: Run; onDone: (b: number, p: number) => void }) {
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState(newKey);
  return (
    <section className="panel">
      <h2>إضافة نقاط لطلب</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() =>
            api<{ balance: number; points: number }>("/api/cashier/earn", {
              body: { customerId: customer.id, externalRef: ref.trim(), amount, idempotencyKey: key },
            }),
          );
          if (r) {
            onDone(r.balance, r.points);
            setRef("");
            setAmount("");
            setKey(newKey());
          }
        }}
      >
        <div className="grid2">
          <div>
            <label htmlFor="ref">رقم الطلب</label>
            <input id="ref" className="ltr" required maxLength={40} value={ref} onChange={(e) => { setRef(e.target.value); setKey(newKey()); }} />
          </div>
          <div>
            <label htmlFor="amt">المبلغ (ريال)</label>
            <input id="amt" inputMode="decimal" required value={amount} onChange={(e) => { setAmount(e.target.value); setKey(newKey()); }} />
          </div>
        </div>
        <p className="muted small">النقاط تُحسب تلقائياً من المبلغ.</p>
        <button className="btn-block" disabled={busy}>إضافة</button>
      </form>
    </section>
  );
}

function RedeemForm({ customer, busy, run, onDone }: { customer: CustomerView; busy: boolean; run: Run; onDone: (b: number) => void }) {
  const [rewardId, setRewardId] = useState("");
  const [code, setCode] = useState("");
  const [key, setKey] = useState(newKey);
  const eligible = customer.rewards.filter((r) => r.eligible);
  return (
    <section className="panel">
      <h2>استبدال مكافأة</h2>
      {eligible.length === 0 ? (
        <p className="muted">لا توجد مكافأة متاحة لرصيد العميل.</p>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() =>
              api<{ balance: number }>("/api/cashier/redeem", { body: { customerId: customer.id, rewardId, code, idempotencyKey: key } }),
            );
            setCode("");
            setKey(newKey());
            if (r) {
              setRewardId("");
              onDone(r.balance);
            }
          }}
        >
          <select required value={rewardId} onChange={(e) => setRewardId(e.target.value)} aria-label="المكافأة">
            <option value="">اختر المكافأة</option>
            {eligible.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.cost}
              </option>
            ))}
          </select>
          <div>
            <label htmlFor="code">رمز الاستبدال من جوال العميل</label>
            <input
              id="code"
              className="ltr"
              inputMode="numeric"
              autoComplete="off"
              required
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <p className="muted small">اطلب من العميل فتح بطاقته والضغط على &quot;أظهر رمز الاستبدال&quot;. لا تطلب أي رقم آخر.</p>
          <button className="btn-gold btn-block" disabled={busy}>استبدال</button>
        </form>
      )}
    </section>
  );
}

function RefundForm({ busy, run, onDone }: { busy: boolean; run: Run; onDone: (pts: number) => void }) {
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  return (
    <details className="panel">
      <summary>مرتجع طلب</summary>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!confirm(`تأكيد مرتجع الطلب ${ref}؟ ستُخصم نقاطه تلقائياً.`)) return;
          const r = await run(() => api<{ reversedPoints: number }>("/api/cashier/refund", { body: { externalRef: ref.trim(), reason } }));
          if (r) {
            onDone(r.reversedPoints);
            setRef("");
            setReason("");
          }
        }}
      >
        <input className="ltr" placeholder="رقم الطلب" required value={ref} onChange={(e) => setRef(e.target.value)} aria-label="رقم الطلب" />
        <input placeholder="السبب (اختياري)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="السبب" />
        <button className="btn-danger btn-block" disabled={busy}>تنفيذ المرتجع</button>
      </form>
    </details>
  );
}

function ManagerTools({ customer, busy, run, onDone }: { customer: CustomerView; busy: boolean; run: Run; onDone: (b: number) => void }) {
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newKey);
  const [linkQr, setLinkQr] = useState("");
  return (
    <details className="panel">
      <summary>أدوات المدير</summary>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() =>
            api<{ balance: number }>("/api/manager/adjust", {
              body: { customerId: customer.id, points: Number(points), reason, idempotencyKey: key },
            }),
          );
          if (r) {
            onDone(r.balance);
            setPoints("");
            setReason("");
            setKey(newKey());
          }
        }}
      >
        <h2>إضافة/خصم يدوي بدون طلب</h2>
        <input className="ltr" inputMode="numeric" placeholder="عدد النقاط (سالب للخصم)" required value={points} onChange={(e) => { setPoints(e.target.value); setKey(newKey()); }} aria-label="النقاط" />
        <input placeholder="السبب (إجباري)" required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="السبب" />
        <button disabled={busy}>تنفيذ</button>
      </form>
      <div className="stack">
        <h2>إعادة إرسال رابط البطاقة</h2>
        <p className="muted small">يُبطل الرابط القديم. يمسح العميل الرمز بكاميرا جواله.</p>
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={async () => {
            const r = await run(() => api<{ qrSvg: string }>("/api/manager/card-link", { body: { customerId: customer.id } }));
            if (r) setLinkQr(r.qrSvg);
          }}
        >
          إصدار رابط جديد
        </button>
        {linkQr && <div className="qr" dangerouslySetInnerHTML={{ __html: linkQr }} />}
      </div>
    </details>
  );
}
