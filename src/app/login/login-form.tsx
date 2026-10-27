"use client";

import { useState } from "react";
import { api } from "@/ui/api";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    <form onSubmit={submit} className="stack">
      <div>
        <label htmlFor="u">اسم المستخدم</label>
        <input id="u" className="ltr" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div>
        <label htmlFor="p">كلمة المرور</label>
        <input id="p" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <button className="btn-block" disabled={busy}>{busy ? "..." : "دخول"}</button>
    </form>
  );
}
