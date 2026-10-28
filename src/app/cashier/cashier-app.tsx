"use client";

import { useCallback, useState } from "react";
import { api, ApiError, newKey } from "@/ui/api";
import Scanner from "@/ui/scanner";
import { CASHIER_TEXT, errorText, saveLang, tierText, type CashierText, type Lang } from "@/ui/i18n/cashier";
import { GUIDE_BN } from "@/ui/i18n/cashier-guide";

interface CustomerView {
  id: string;
  name: string;
  maskedPhone: string;
  unit: "POINT" | "STAMP";
  balance: number;
  tierLabel: string;
  rewards: { id: string; name: string; cost: number; eligible: boolean }[];
  recentOrders: { id: string; amountHalalas: number; cups: number | null; createdAt: string; refunded: boolean }[];
  /** يصدر فقط عند فتح العميل بمسح QR من جواله، ويُشترط للاستبدال */
  presence?: string;
}

type Msg = { type: "ok" | "error" | "warn"; text: string } | null;

export default function CashierApp({
  staffName,
  role,
  signupQr,
  initialLang,
}: {
  staffName: string;
  role: string;
  signupQr: string;
  initialLang: Lang;
}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = CASHIER_TEXT[lang];
  const err = (e: unknown) => errorText((e as Error).message, lang);
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
      setMsg({ type: "error", text: err(e) });
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
        setMsg({ type: "warn", text: t.notRegistered });
      } else {
        setMsg({ type: "error", text: errorText((e as Error).message, lang) });
      }
    } finally {
      setBusy(false);
    }
  }, [t, lang]);

  /** إعادة تحميل بيانات العميل بعد كل عملية (الرصيد والمكافآت المتاحة) */
  const reload = async (id: string, text: string) => {
    try {
      const fresh = await api<CustomerView>("/api/cashier/lookup", { body: { customerId: id } });
      // إعادة التحميل لا تُصدر توكن حضور جديد، فنحتفظ بالتوكن من مسح QR
      setCustomer((prev) => ({ ...fresh, presence: prev?.id === id ? prev.presence : undefined }));
    } catch {
      /* يبقى العرض السابق */
    }
    setMsg({ type: "ok", text });
  };

  return (
    <main className="wrap stack" dir={t.dir} lang={lang}>
      <div className="row spread">
        <div className="brandbar">
          <img src="/icon-192.png" alt="" />
          <h1>{t.cashier}</h1>
        </div>
        <div className="row small">
          <span className="muted">{staffName}</span>
          <LangSwitch t={t} onSwitch={() => { const next = lang === "bn" ? "ar" : "bn"; saveLang(next); setLang(next); setMsg(null); }} />
          {isManager && <a href="/admin">{t.admin}</a>}
          <button className="btn-ghost btn-sm" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); location.href = "/login"; }}>
            {t.logout}
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`} role="status">{msg.text}</div>}

      {!customer ? (
        <section className="panel stack">
          <h2>{t.customer}</h2>
          <Scanner t={t} onResult={(qr) => lookup({ qr })} />
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              lookup({ phone });
            }}
          >
            <label htmlFor="ph">{t.searchByPhone}</label>
            <div className="row">
              <input id="ph" inputMode="numeric" placeholder="05XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button disabled={busy || phone.length < 9}>{t.search}</button>
            </div>
          </form>
          {showSignup ? (
            <div className="stack">
              <h3>{t.newCustomerTitle}</h3>
              <div className="signup-qr" dangerouslySetInnerHTML={{ __html: signupQr }} />
              <p className="muted small">{t.newCustomerHint}</p>
              <div className="row">
                <button className="btn-ghost btn-sm" onClick={() => setShowSignup(false)}>{t.hide}</button>
                <a href="/signup-qr" target="_blank">{t.printCopy}</a>
              </div>
            </div>
          ) : (
            <button className="btn-ghost" onClick={() => setShowSignup(true)}>{t.showSignup}</button>
          )}
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="row spread">
              <div>
                <b>{customer.name}</b> <span className="tag">{tierText(customer.tierLabel, lang)}</span>
                <div className="muted small ltr">{customer.maskedPhone}</div>
              </div>
              <div>
                <b className="balance-inline">{customer.balance}</b> {customer.unit === "STAMP" ? t.stamp : t.point}
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => { setCustomer(null); setPhone(""); setMsg(null); }}>
              {t.otherCustomer}
            </button>
          </section>

          <EarnForm
            t={t}
            customer={customer}
            busy={busy}
            run={run}
            onDone={(balance, points) => reload(customer.id, t.added(points, balance))}
          />

          <RedeemForm
            t={t}
            customer={customer}
            busy={busy}
            run={run}
            onDone={(balance) => reload(customer.id, t.redeemed(balance))}
          />

          {isManager && (
            <ManagerTools
              t={t}
              customer={customer}
              busy={busy}
              run={run}
              onDone={(balance) => reload(customer.id, t.done(balance))}
            />
          )}

          <RefundForm t={t} lang={lang} customer={customer} busy={busy} run={run} onDone={(pts) => reload(customer.id, t.refunded(pts))} />
        </>
      )}

      {lang === "bn" && <Guide />}
    </main>
  );
}

function LangSwitch({ t, onSwitch }: { t: CashierText; onSwitch: () => void }) {
  return (
    <button type="button" className="btn-ghost btn-sm lang-switch" onClick={onSwitch} aria-label={t.switchLabel}>
      {t.switchTo}
    </button>
  );
}

function Guide() {
  return (
    <details className="panel guide">
      <summary>{GUIDE_BN.title}</summary>
      <p className="muted small">{GUIDE_BN.intro}</p>
      <ol>
        {GUIDE_BN.steps.map((s) => (
          <li key={s.title}>
            <b>{s.title}</b>
            <ul>
              {s.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </li>
        ))}
      </ol>
      <h3>{GUIDE_BN.rulesTitle}</h3>
      <ul>
        {GUIDE_BN.rules.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </details>
  );
}

type Run = <T>(fn: () => Promise<T>) => Promise<T | null>;

function EarnForm({ t, customer, busy, run, onDone }: { t: CashierText; customer: CustomerView; busy: boolean; run: Run; onDone: (b: number, p: number) => void }) {
  const [amount, setAmount] = useState("");
  const [cups, setCups] = useState(1);
  const [key, setKey] = useState(newKey);
  const stamps = customer.unit === "STAMP";
  return (
    <section className="panel">
      <h2>{stamps ? t.earnStamps : t.earnPoints}</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() =>
            api<{ balance: number; points: number }>("/api/cashier/earn", {
              body: { customerId: customer.id, amount, idempotencyKey: key, ...(stamps ? { cups } : {}) },
            }),
          );
          if (r) {
            onDone(r.balance, r.points);
            setAmount("");
            setCups(1);
            setKey(newKey());
          }
        }}
      >
        <div>
          <label htmlFor="amt">{t.amount}</label>
          <input id="amt" inputMode="decimal" required value={amount} onChange={(e) => { setAmount(e.target.value); setKey(newKey()); }} />
        </div>
        {stamps && (
          <div>
            <label>{t.cups}</label>
            <div className="stepper" role="group" aria-label={t.cups}>
              <button type="button" className="btn-ghost" aria-label={t.decrease} onClick={() => { setCups((c) => Math.max(1, c - 1)); setKey(newKey()); }}>−</button>
              <output aria-live="polite">{cups}</output>
              <button type="button" className="btn-ghost" aria-label={t.increase} onClick={() => { setCups((c) => Math.min(20, c + 1)); setKey(newKey()); }}>+</button>
            </div>
          </div>
        )}
        <p className="muted small">{stamps ? t.stampsHint : t.pointsHint}</p>
        <button className="btn-block" disabled={busy}>{t.add}</button>
      </form>
    </section>
  );
}

function RedeemForm({ t, customer, busy, run, onDone }: { t: CashierText; customer: CustomerView; busy: boolean; run: Run; onDone: (b: number) => void }) {
  const [rewardId, setRewardId] = useState("");
  const [key, setKey] = useState(newKey);
  const presence = customer.presence;
  const eligible = customer.rewards.filter((r) => r.eligible);
  return (
    <section className="panel">
      <h2>{t.redeemTitle}</h2>
      {eligible.length === 0 ? (
        <p className="muted">{t.noReward}</p>
      ) : !presence ? (
        <p className="alert alert-warn">{t.scanToRedeem}</p>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() =>
              api<{ balance: number }>("/api/cashier/redeem", { body: { customerId: customer.id, rewardId, presence, idempotencyKey: key } }),
            );
            setKey(newKey());
            if (r) {
              setRewardId("");
              onDone(r.balance);
            }
          }}
        >
          <select required value={rewardId} onChange={(e) => setRewardId(e.target.value)} aria-label={t.reward}>
            <option value="">{t.chooseReward}</option>
            {eligible.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.cost}
              </option>
            ))}
          </select>
          <p className="muted small">{t.redeemHint}</p>
          <button className="btn-gold btn-block" disabled={busy}>{t.redeem}</button>
        </form>
      )}
    </section>
  );
}

function RefundForm({ t, lang, customer, busy, run, onDone }: { t: CashierText; lang: Lang; customer: CustomerView; busy: boolean; run: Run; onDone: (pts: number) => void }) {
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const orders = customer.recentOrders.filter((o) => !o.refunded);
  const fmt = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "ar-SA", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const label = (o: CustomerView["recentOrders"][number]) =>
    [`${(o.amountHalalas / 100).toFixed(2)} ${t.sar}`, o.cups ? t.cupsShort(o.cups) : null, fmt.format(new Date(o.createdAt))].filter(Boolean).join(" · ");
  return (
    <details className="panel">
      <summary>{t.refundTitle}</summary>
      {orders.length === 0 ? (
        <p className="muted">{t.noOrders}</p>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const order = orders.find((o) => o.id === orderId);
            if (!order || !confirm(t.refundConfirm(label(order)))) return;
            const r = await run(() => api<{ reversedPoints: number }>("/api/cashier/refund", { body: { orderId, reason } }));
            if (r) {
              onDone(r.reversedPoints);
              setOrderId("");
              setReason("");
            }
          }}
        >
          <p className="muted small">{t.refundHint}</p>
          <select required value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label={t.refundTitle}>
            <option value="">{t.refundTitle}</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>{label(o)}</option>
            ))}
          </select>
          <input placeholder={t.reasonOptional} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t.reason} />
          <button className="btn-danger btn-block" disabled={busy}>{t.doRefund}</button>
        </form>
      )}
    </details>
  );
}

function ManagerTools({ t, customer, busy, run, onDone }: { t: CashierText; customer: CustomerView; busy: boolean; run: Run; onDone: (b: number) => void }) {
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newKey);
  const [linkQr, setLinkQr] = useState("");
  return (
    <details className="panel">
      <summary>{t.managerTools}</summary>
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
        <h2>{t.manualTitle}</h2>
        <input className="ltr" inputMode="numeric" placeholder={t.manualPoints} required value={points} onChange={(e) => { setPoints(e.target.value); setKey(newKey()); }} aria-label={t.points} />
        <input placeholder={t.reasonRequired} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t.reason} />
        <button disabled={busy}>{t.execute}</button>
      </form>
      <div className="stack">
        <h2>{t.resendTitle}</h2>
        <p className="muted small">{t.resendHint}</p>
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={async () => {
            const r = await run(() => api<{ qrSvg: string }>("/api/manager/card-link", { body: { customerId: customer.id } }));
            if (r) setLinkQr(r.qrSvg);
          }}
        >
          {t.newLink}
        </button>
        {linkQr && <div className="qr" dangerouslySetInnerHTML={{ __html: linkQr }} />}
      </div>
    </details>
  );
}
