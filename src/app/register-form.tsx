"use client";

import { useState } from "react";
import { api } from "@/ui/api";
import { MONTHS } from "@/ui/labels";

export default function RegisterForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [referral, setReferral] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("ref") ?? ""),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { cardUrl } = await api<{ cardUrl: string }>("/api/customers/register", {
        body: {
          name,
          phone,
          birthMonth: month ? Number(month) : null,
          birthDay: day ? Number(day) : null,
          referralCode: referral.trim() || null,
        },
      });
      window.location.href = cardUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div>
        <label htmlFor="name">الاسم</label>
        <input id="name" required minLength={2} maxLength={40} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="phone">رقم الجوال</label>
        <input
          id="phone"
          required
          inputMode="numeric"
          autoComplete="tel"
          placeholder="05XXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div>
        <label>تاريخ الميلاد (اختياري — لهدية عيد ميلادك)</label>
        <div className="grid2">
          <select aria-label="الشهر" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">الشهر</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select aria-label="اليوم" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">اليوم</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="ref">كود إحالة صديق (اختياري)</label>
        <input id="ref" className="ltr" maxLength={12} value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} />
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <button className="btn-block" disabled={busy}>
        {busy ? "جارٍ التسجيل..." : "أضف إلى Wallet"}
      </button>
    </form>
  );
}
