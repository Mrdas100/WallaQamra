"use client";

import { useState } from "react";
import { api } from "@/ui/api";
import { CASHIER_TEXT, errorText, saveLang, type Lang } from "@/ui/i18n/cashier";

export default function LoginForm({ initialLang }: { initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = CASHIER_TEXT[lang];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ role: string }>("/api/auth/login", { body: { username, password } });
      window.location.href = r.role === "CASHIER" ? "/cashier" : "/admin";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap stack" dir={t.dir} lang={lang}>
      <div className="row spread">
        <div className="brandbar">
          <img src="/icon-192.png" alt="" />
          <h1>{t.loginTitle}</h1>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm lang-switch"
          aria-label={t.switchLabel}
          onClick={() => {
            const next = lang === "bn" ? "ar" : "bn";
            saveLang(next);
            setLang(next);
          }}
        >
          {t.switchTo}
        </button>
      </div>
      <section className="panel">
        <form onSubmit={submit} className="stack">
          <div>
            <label htmlFor="u">{t.username}</label>
            <input id="u" className="ltr" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label htmlFor="p">{t.password}</label>
            <input id="p" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="alert alert-error" role="alert">{errorText(error, lang)}</div>}
          <button className="btn-block" disabled={busy}>{busy ? "..." : t.login}</button>
        </form>
      </section>
    </main>
  );
}
