"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/ui/api";
import { MONTHS } from "@/ui/labels";

interface Props {
  id: string;
  cardKey: string;
  promoOptOut: boolean;
  hasBirthday: boolean;
  referralUrl: string;
  referralCode: string;
}

export default function CardClient({ id, cardKey, promoOptOut, hasBirthday, referralUrl, referralCode }: Props) {
  const headers = { "x-card-key": cardKey };
  const [qr, setQr] = useState<string>("");
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [optOut, setOptOut] = useState(promoOptOut);
  const [bday, setBday] = useState({ m: "", d: "", saved: hasBirthday });
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const loadQr = useCallback(async () => {
    try {
      const r = await api<{ svg: string; refreshInSeconds: number }>(`/api/card/${id}/qr`, { headers: { "x-card-key": cardKey } });
      setQr(r.svg);
      return r.refreshInSeconds;
    } catch {
      return 30;
    }
  }, [id, cardKey]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const tick = async () => {
      const next = await loadQr();
      if (alive) timer = setTimeout(tick, next * 1000);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [loadQr]);

  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((code.expiresAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setCode(null);
    }, 500);
    return () => clearInterval(t);
  }, [code]);

  async function newCode() {
    setMsg(null);
    try {
      const r = await api<{ code: string; expiresAt: string }>(`/api/card/${id}/redeem-code`, { method: "POST", headers });
      const expiresAt = Date.parse(r.expiresAt);
      setLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
      setCode({ code: r.code, expiresAt });
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
    }
  }

  async function savePrefs(body: Record<string, unknown>) {
    setMsg(null);
    try {
      await api(`/api/card/${id}/prefs`, { method: "PATCH", headers, body });
      setMsg({ type: "ok", text: "تم الحفظ" });
      return true;
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
      return false;
    }
  }

  return (
    <>
      <section className="panel stack">
        <h2>امسح عند الكاشير</h2>
        <div className="qr" aria-label="رمز QR للبطاقة" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="muted small">الرمز يتجدد تلقائياً ولا يحتوي رقم جوالك.</p>
      </section>

      <section className="panel stack">
        <h2>استبدال مكافأة</h2>
        {code ? (
          <>
            <div className="code" aria-live="polite">{code.code}</div>
            <p className="muted small">أعطِ هذا الرمز للكاشير الآن. ينتهي خلال {left} ثانية ويُستخدم مرة واحدة.</p>
          </>
        ) : (
          <>
            <p className="muted small">اطلب الرمز فقط وأنت أمام الكاشير وتريد الاستبدال.</p>
            <button className="btn-gold btn-block" onClick={newCode}>
              أظهر رمز الاستبدال
            </button>
          </>
        )}
      </section>

      <section className="panel stack">
        <h2>ادعُ صديقاً</h2>
        <p className="small">
          كودك: <b className="ltr">{referralCode}</b> — تحصلان كلاكما على نقاط بعد أول طلب لصديقك.
        </p>
        <button
          className="btn-ghost btn-block"
          onClick={async () => {
            const data = { title: "شاهي قمرا", text: "سجّل في بطاقة ولاء شاهي قمرا", url: referralUrl };
            if (navigator.share) await navigator.share(data).catch(() => undefined);
            else await navigator.clipboard.writeText(referralUrl).then(() => setMsg({ type: "ok", text: "تم نسخ الرابط" }));
          }}
        >
          مشاركة رابط الدعوة
        </button>
      </section>

      <section className="panel stack">
        <h2>الإعدادات</h2>
        <p className="small">
          إشعارات العروض على البطاقة: <span className="tag">{optOut ? "متوقفة" : "مفعّلة"}</span>
        </p>
        <button className="btn-ghost btn-sm" onClick={async () => { if (await savePrefs({ promoOptOut: !optOut })) setOptOut(!optOut); }}>
          {optOut ? "تفعيل إشعارات العروض" : "إيقاف إشعارات العروض"}
        </button>
        {!bday.saved && (
          <div className="stack">
            <label>أضف تاريخ ميلادك لتصلك هدية (لا يمكن تغييره لاحقاً)</label>
            <div className="grid2">
              <select aria-label="الشهر" value={bday.m} onChange={(e) => setBday({ ...bday, m: e.target.value })}>
                <option value="">الشهر</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select aria-label="اليوم" value={bday.d} onChange={(e) => setBday({ ...bday, d: e.target.value })}>
                <option value="">اليوم</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>
            <button
              className="btn-ghost"
              disabled={!bday.m || !bday.d}
              onClick={async () => {
                if (await savePrefs({ birthMonth: Number(bday.m), birthDay: Number(bday.d) })) setBday({ ...bday, saved: true });
              }}
            >
              حفظ تاريخ الميلاد
            </button>
          </div>
        )}
        {msg && <div className={`alert ${msg.type === "ok" ? "alert-ok" : "alert-error"}`}>{msg.text}</div>}
      </section>
    </>
  );
}
