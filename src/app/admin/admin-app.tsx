"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "@/ui/api";
import { ALERT_LABEL, LEDGER_LABEL, ROLE_LABEL, TIER_LABEL } from "@/ui/labels";
import DesignEditor from "./design-editor";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const TABS = [
  { id: "reports", label: "التقارير", admin: false },
  { id: "alerts", label: "تنبيهات التلاعب", admin: false },
  { id: "customers", label: "العملاء", admin: false },
  { id: "ledger", label: "الحركات", admin: false },
  { id: "design", label: "تصميم بطاقة الولاء", admin: true },
  { id: "rewards", label: "المكافآت", admin: true },
  { id: "campaigns", label: "الحملات", admin: true },
  { id: "locations", label: "الفروع والمواقع", admin: true },
  { id: "staff", label: "الموظفون", admin: true },
  { id: "settings", label: "الإعدادات", admin: true },
  { id: "audit", label: "سجل التدقيق", admin: true },
] as const;

function useLoad<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string }>({ data: null, error: "" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path).then(
      (data) => alive && setState({ data, error: "" }),
      (e: Error) => alive && setState((s) => ({ ...s, error: e.message })),
    );
    return () => {
      alive = false;
    };
  }, [path, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

export default function AdminApp({ staffName, role, staffId, nonce }: { staffName: string; role: string; staffId: string; nonce: string }) {
  const isAdmin = role === "ADMIN";
  const [tab, setTab] = useState<string>("reports");
  return (
    <main className="wrap-wide stack">
      <div className="row spread">
        <div className="brandbar">
          <img src="/icon-192.png" alt="" />
          <h1>إدارة شاهي قمرا</h1>
        </div>
        <div className="row small">
          <span className="muted">
            {staffName} ({ROLE_LABEL[role]})
          </span>
          <a href="/cashier">الكاشير</a>
          <a href="/signup-qr">رمز تسجيل العملاء</a>
          <button className="btn-ghost btn-sm" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); location.href = "/login"; }}>
            خروج
          </button>
        </div>
      </div>
      <nav className="tabs" role="tablist">
        {TABS.filter((t) => isAdmin || !t.admin).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "reports" && <Reports isAdmin={isAdmin} />}
      {tab === "alerts" && <Alerts />}
      {tab === "customers" && <Customers />}
      {tab === "ledger" && <Ledger />}
      {tab === "design" && <DesignEditor nonce={nonce} />}
      {tab === "rewards" && <Rewards />}
      {tab === "campaigns" && <Campaigns />}
      {tab === "locations" && <Locations />}
      {tab === "staff" && <StaffTab selfId={staffId} />}
      {tab === "settings" && <SettingsTab />}
      {tab === "audit" && <Audit />}
    </main>
  );
}

function Err({ text }: { text: string }) {
  return text ? <div className="alert alert-error">{text}</div> : null;
}

function Reports({ isAdmin }: { isAdmin: boolean }) {
  const [days, setDays] = useState(30);
  const { data, error } = useLoad<Any>(`/api/admin/reports?days=${days}`);
  const max = Math.max(1, ...(data?.byHour ?? []).map((h: Any) => h.orders));
  return (
    <section className="stack">
      <div className="row">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="الفترة">
          {[7, 30, 90, 365].map((d) => (
            <option key={d} value={d}>آخر {d} يوم</option>
          ))}
        </select>
        {isAdmin && (
          <>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- تنزيل ملف CSV من الـ API */}
            <a className="btn btn-ghost btn-sm" href="/api/admin/export/customers">تصدير العملاء CSV</a>
            <a className="btn btn-ghost btn-sm" href={`/api/admin/export/ledger?days=${days}`}>تصدير الحركات CSV</a>
          </>
        )}
      </div>
      <Err text={error} />
      {data && (
        <>
          <div className="kpis">
            <Kpi label="إجمالي العملاء" value={data.totalCustomers} />
            <Kpi label="عملاء جدد" value={data.newCustomers} />
            <Kpi label="العملاء النشطون" value={data.activeCustomers} />
            <Kpi label="معدل العودة" value={`${data.returnRatePct}%`} />
            <Kpi label="الطلبات" value={data.orders} />
            <Kpi label="المبيعات (ريال)" value={data.revenueSar} />
            <Kpi label="النقاط الممنوحة" value={data.pointsGranted} />
            <Kpi label="النقاط المستبدلة" value={data.pointsRedeemed} />
            <Kpi label="النقاط المنتهية" value={data.pointsExpired} />
            <Kpi label="الاستبدالات" value={data.redemptions} />
          </div>
          <div className="panel">
            <h2>أفضل الساعات (عدد الطلبات حسب الساعة)</h2>
            <div className="bars">
              {data.byHour.map((h: Any) => (
                <meter key={h.hour} min={0} max={max} value={h.orders} title={`${h.hour}:00 — ${h.orders}`} />
              ))}
            </div>
            <div className="row spread small muted ltr"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
          </div>
        </>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <span className="muted small">{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Alerts() {
  const { data, error, reload } = useLoad<Any[]>("/api/admin/alerts");
  return (
    <section className="panel">
      <h2>تنبيهات مفتوحة</h2>
      <Err text={error} />
      {data?.length === 0 && <p className="muted">لا توجد تنبيهات.</p>}
      <div className="table-wrap">
        <table>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id}>
                <td>
                  <b>{ALERT_LABEL[a.type] ?? a.type}</b>
                  <div className="muted small">{fmtDate(a.createdAt)}</div>
                </td>
                <td className="small ltr">{JSON.stringify(a.details)}</td>
                <td className="small">{a.staffId ? `موظف: ${a.staffId.slice(-6)}` : ""}{a.customerId ? ` · عميل: ${a.customerId.slice(-6)}` : ""}</td>
                <td>
                  <button className="btn-ghost btn-sm" onClick={async () => { await api(`/api/admin/alerts/${a.id}`, { method: "POST" }); reload(); }}>
                    تمت المراجعة
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Customers() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error } = useLoad<Any[]>(`/api/admin/customers?q=${encodeURIComponent(query)}`);
  return (
    <section className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <input placeholder="بحث بالاسم أو الجوال أو كود الإحالة" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
        <button>بحث</button>
      </form>
      <Err text={error} />
      {selected && <CustomerDetail id={selected} onClose={() => setSelected(null)} />}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr><th>الاسم</th><th>الجوال</th><th>النقاط</th><th>الأختام</th><th>التسجيل</th><th /></tr>
          </thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="ltr">{c.phone}</td>
                <td>{c.points}</td>
                <td>{c.stamps}</td>
                <td className="small">{fmtDate(c.createdAt)}</td>
                <td><button className="btn-ghost btn-sm" onClick={() => setSelected(c.id)}>تفاصيل</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, reload } = useLoad<Any>(`/api/admin/customers/${id}`);
  const [msg, setMsg] = useState("");
  async function correct(entryId: string) {
    const reason = prompt("سبب التصحيح (إجباري):");
    if (!reason) return;
    try {
      await api("/api/manager/correct", { body: { entryId, reason } });
      setMsg("تم إنشاء حركة عكسية");
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <div className="panel stack">
      <div className="row spread">
        <h2>{data?.name}</h2>
        <button className="btn-ghost btn-sm" onClick={onClose}>إغلاق</button>
      </div>
      <Err text={error} />
      {msg && <div className="alert alert-warn">{msg}</div>}
      {data && (
        <>
          <p className="small">
            الجوال: <span className="ltr">{data.phone}</span> · المستوى: {data.tierLabel} · الرصيد: <b>{data.balance}</b>
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>الوقت</th><th>النوع</th><th>القيمة</th><th>الموظف</th><th>السبب</th><th /></tr></thead>
              <tbody>
                {data.entries.map((e: Any) => (
                  <tr key={e.id}>
                    <td className="small">{fmtDate(e.createdAt)}</td>
                    <td>{LEDGER_LABEL[e.type]}</td>
                    <td><span className={e.points > 0 ? "pos" : "neg"}>{e.points}</span></td>
                    <td className="small">{e.staff?.username ?? "النظام"}</td>
                    <td className="small">{e.reason}</td>
                    <td>
                      {e.type !== "EXPIRY" && (
                        <button className="btn-ghost btn-sm" onClick={() => correct(e.id)}>عكس</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Ledger() {
  const [type, setType] = useState("");
  const { data, error } = useLoad<Any[]>(`/api/admin/ledger${type ? `?type=${type}` : ""}`);
  return (
    <section className="stack">
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="نوع الحركة">
        <option value="">كل الحركات</option>
        {Object.entries(LEDGER_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <Err text={error} />
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>الوقت</th><th>العميل</th><th>النوع</th><th>القيمة</th><th>الطلب</th><th>الموظف</th><th>الجهاز/IP</th><th>السبب</th></tr></thead>
          <tbody>
            {data?.map((e) => (
              <tr key={e.id}>
                <td className="small">{fmtDate(e.createdAt)}</td>
                <td>{e.customer?.name}</td>
                <td>{LEDGER_LABEL[e.type]}</td>
                <td><span className={e.points > 0 ? "pos" : "neg"}>{e.points}</span></td>
                <td className="ltr small">{e.order?.externalRef}</td>
                <td className="small">{e.staff?.username ?? "النظام"}</td>
                <td className="small ltr">{e.deviceId?.slice(0, 8)} {e.ip}</td>
                <td className="small">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Rewards() {
  const { data, error, reload } = useLoad<Any[]>("/api/admin/rewards");
  const empty = { name: "", description: "", cost: 100, unit: "POINT", minTier: "BRONZE", active: true, sortOrder: 0 };
  const [form, setForm] = useState<Any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body = { ...form, cost: Number(form.cost), sortOrder: Number(form.sortOrder) };
      await api(editing ? `/api/admin/rewards/${editing}` : "/api/admin/rewards", { method: editing ? "PATCH" : "POST", body });
      setForm(empty);
      setEditing(null);
      setMsg("");
      reload();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }
  return (
    <section className="stack">
      <form className="panel stack" onSubmit={save}>
        <h2>{editing ? "تعديل مكافأة" : "مكافأة جديدة"}</h2>
        <div className="grid2">
          <input placeholder="الاسم (مشروب مجاني، خصم...)" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="الاسم" />
          <input placeholder="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="الوصف" />
          <div><label>التكلفة</label><input type="number" min={1} required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
          <div><label>الوحدة</label>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="POINT">نقاط</option><option value="STAMP">أختام</option>
            </select>
          </div>
          <div><label>أقل مستوى</label>
            <select value={form.minTier} onChange={(e) => setForm({ ...form, minTier: e.target.value })}>
              {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label>الترتيب</label><input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
        </div>
        <label className="row"><input type="checkbox" className="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> فعّالة</label>
        <Err text={msg} />
        <div className="row"><button>حفظ</button>{editing && <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setForm(empty); }}>إلغاء</button>}</div>
      </form>
      <Err text={error} />
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>المكافأة</th><th>التكلفة</th><th>المستوى</th><th>الحالة</th><th /></tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id}>
                <td>{r.name}<div className="muted small">{r.description}</div></td>
                <td>{r.cost} {r.unit === "STAMP" ? "ختم" : "نقطة"}</td>
                <td>{TIER_LABEL[r.minTier]}</td>
                <td>{r.active ? "فعّالة" : "متوقفة"}</td>
                <td><button className="btn-ghost btn-sm" onClick={() => { setEditing(r.id); setForm({ ...r }); }}>تعديل</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const toHHMM = (m: number | null | undefined) =>
  m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const toLocalInput = (d: string) => new Date(new Date(d).getTime() + 3 * 3600_000).toISOString().slice(0, 16);
const fromLocalInput = (s: string) => new Date(`${s}:00+03:00`).toISOString();

function Campaigns() {
  const { data, error, reload } = useLoad<Any[]>("/api/admin/campaigns");
  const blank = (): Any => ({ name: "", multiplierPct: 200, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 86400_000).toISOString(), startMinute: null, endMinute: null, daysMask: 127, active: true });
  const [form, setForm] = useState<Any>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body = { name: form.name, multiplierPct: Number(form.multiplierPct), startsAt: form.startsAt, endsAt: form.endsAt, startMinute: form.startMinute, endMinute: form.endMinute, daysMask: form.daysMask, active: form.active };
      await api(editing ? `/api/admin/campaigns/${editing}` : "/api/admin/campaigns", { method: editing ? "PATCH" : "POST", body });
      setForm(blank()); setEditing(null); setMsg(""); reload();
    } catch (err) { setMsg((err as Error).message); }
  }
  return (
    <section className="stack">
      <form className="panel stack" onSubmit={save}>
        <h2>{editing ? "تعديل حملة" : "حملة نقاط مضاعفة"}</h2>
        <div className="grid2">
          <input placeholder="اسم الحملة (مثلاً ساعات الهدوء)" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="الاسم" />
          <div><label>المضاعِف %</label><input type="number" min={100} max={500} step={10} value={form.multiplierPct} onChange={(e) => setForm({ ...form, multiplierPct: e.target.value })} /></div>
          <div><label>من</label><input type="datetime-local" value={toLocalInput(form.startsAt)} onChange={(e) => setForm({ ...form, startsAt: fromLocalInput(e.target.value) })} /></div>
          <div><label>إلى</label><input type="datetime-local" value={toLocalInput(form.endsAt)} onChange={(e) => setForm({ ...form, endsAt: fromLocalInput(e.target.value) })} /></div>
          <div><label>ساعات يومية من (اختياري)</label><input type="time" value={toHHMM(form.startMinute)} onChange={(e) => setForm({ ...form, startMinute: fromHHMM(e.target.value) })} /></div>
          <div><label>إلى</label><input type="time" value={toHHMM(form.endMinute)} onChange={(e) => setForm({ ...form, endMinute: fromHHMM(e.target.value) })} /></div>
        </div>
        <div className="row small">
          {DAYS.map((d, i) => (
            <label key={d} className="row">
              <input type="checkbox" className="checkbox" checked={(form.daysMask & (1 << i)) !== 0} onChange={(e) => setForm({ ...form, daysMask: e.target.checked ? form.daysMask | (1 << i) : form.daysMask & ~(1 << i) })} />
              {d}
            </label>
          ))}
        </div>
        <label className="row"><input type="checkbox" className="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> فعّالة</label>
        <Err text={msg} />
        <div className="row"><button>حفظ</button>{editing && <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setForm(blank()); }}>إلغاء</button>}</div>
      </form>
      <Err text={error} />
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>الحملة</th><th>المضاعِف</th><th>الفترة</th><th>الساعات</th><th /></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id}>
                <td>{c.name} {!c.active && <span className="tag">متوقفة</span>}</td>
                <td>{c.multiplierPct}%</td>
                <td className="small">{fmtDate(c.startsAt)} — {fmtDate(c.endsAt)}</td>
                <td className="ltr small">{c.startMinute != null ? `${toHHMM(c.startMinute)}–${toHHMM(c.endMinute)}` : "طوال اليوم"}</td>
                <td><button className="btn-ghost btn-sm" onClick={() => { setEditing(c.id); setForm({ ...c }); }}>تعديل</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Locations() {
  const { data, error, reload } = useLoad<Any[]>("/api/admin/locations");
  const empty = { name: "", latitude: "", longitude: "", relevantText: "حياك في شاهي قمرا، رصيدك {points} نقطة", maxDistance: 100, active: true };
  const [form, setForm] = useState<Any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body = { name: form.name, latitude: Number(form.latitude), longitude: Number(form.longitude), relevantText: form.relevantText, maxDistance: Number(form.maxDistance), active: form.active };
      await api(editing ? `/api/admin/locations/${editing}` : "/api/admin/locations", { method: editing ? "PATCH" : "POST", body });
      setForm(empty); setEditing(null); setMsg("تم الحفظ — سيتم تحديث كل البطاقات"); reload();
    } catch (err) { setMsg((err as Error).message); }
  }
  return (
    <section className="stack">
      <form className="panel stack" onSubmit={save}>
        <h2>{editing ? "تعديل موقع" : "موقع فرع (حد أقصى 10)"}</h2>
        <p className="muted small">الجوال يعرض التنبيه عند الاقتراب. لا يُجمع موقع العميل ولا يُرسل للتطبيق.</p>
        <div className="grid2">
          <input placeholder="اسم الفرع" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="الاسم" />
          <div><label>المسافة (متر)</label><input type="number" min={10} max={1000} value={form.maxDistance} onChange={(e) => setForm({ ...form, maxDistance: e.target.value })} /></div>
          <div><label>خط العرض</label><input className="ltr" inputMode="decimal" required value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
          <div><label>خط الطول</label><input className="ltr" inputMode="decimal" required value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
        </div>
        <div>
          <label>نص التنبيه ({"{points}"} = الرصيد، {"{name}"} = اسم العميل)</label>
          <input required maxLength={120} value={form.relevantText} onChange={(e) => setForm({ ...form, relevantText: e.target.value })} />
        </div>
        <label className="row"><input type="checkbox" className="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> فعّال</label>
        {msg && <div className="alert alert-warn">{msg}</div>}
        <div className="row"><button>حفظ</button>{editing && <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setForm(empty); }}>إلغاء</button>}</div>
      </form>
      <Err text={error} />
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>الفرع</th><th>الإحداثيات</th><th>النص</th><th>المسافة</th><th /></tr></thead>
          <tbody>
            {data?.map((l) => (
              <tr key={l.id}>
                <td>{l.name} {!l.active && <span className="tag">متوقف</span>}</td>
                <td className="ltr small">{l.latitude}, {l.longitude}</td>
                <td className="small">{l.relevantText}</td>
                <td>{l.maxDistance}م</td>
                <td className="row">
                  <button className="btn-ghost btn-sm" onClick={() => { setEditing(l.id); setForm({ ...l }); }}>تعديل</button>
                  <button className="btn-ghost btn-sm" onClick={async () => { if (confirm("حذف الموقع؟")) { await api(`/api/admin/locations/${l.id}`, { method: "DELETE" }); reload(); } }}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StaffTab({ selfId }: { selfId: string }) {
  const { data, error, reload } = useLoad<Any[]>("/api/admin/staff");
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "CASHIER" });
  const [msg, setMsg] = useState("");
  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); setMsg(""); reload(); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <section className="stack">
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); act(async () => { await api("/api/admin/staff", { body: form }); setForm({ username: "", name: "", password: "", role: "CASHIER" }); }); }}>
        <h2>موظف جديد</h2>
        <div className="grid2">
          <input className="ltr" placeholder="اسم المستخدم" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} aria-label="اسم المستخدم" />
          <input placeholder="الاسم" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="الاسم" />
          <input type="password" placeholder="كلمة المرور (10+ أحرف)" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-label="كلمة المرور" autoComplete="new-password" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label="الدور">
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button>إضافة</button>
      </form>
      <Err text={msg || error} />
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>الموظف</th><th>الدور</th><th>الحالة</th><th /></tr></thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s.id}>
                <td>{s.name}<div className="muted small ltr">{s.username}</div></td>
                <td>
                  <select disabled={s.id === selfId} value={s.role} aria-label="الدور" onChange={(e) => act(() => api(`/api/admin/staff/${s.id}`, { method: "PATCH", body: { role: e.target.value } }))}>
                    {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td>{s.active ? "نشط" : "معطّل"}</td>
                <td className="row">
                  {s.id !== selfId && (
                    <button className="btn-ghost btn-sm" onClick={() => act(() => api(`/api/admin/staff/${s.id}`, { method: "PATCH", body: { active: !s.active } }))}>
                      {s.active ? "تعطيل" : "تفعيل"}
                    </button>
                  )}
                  <button className="btn-ghost btn-sm" onClick={() => { const p = prompt("كلمة مرور جديدة (10+ أحرف):"); if (p) act(() => api(`/api/admin/staff/${s.id}`, { method: "PATCH", body: { password: p } })); }}>
                    كلمة مرور
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SETTINGS_GROUPS: { title: string; fields: [string, string, ("int" | "time" | "sar")?][] }[] = [
  { title: "بطاقة الأختام", fields: [["stampsPerReward", "عدد الأكواب قبل المجاني"], ["minStampAmountHalalas", "أقل سعر للكوب (ريال)", "sar"], ["maxCupsPerOrder", "أقصى أكواب للطلب الواحد"]] },
  { title: "بطاقة النقاط", fields: [["pointsPerSar", "نقاط لكل ريال"], ["rewardThreshold", "حد المكافأة (نقاط)"], ["maxOrderAmountHalalas", "أقصى مبلغ للطلب (ريال)", "sar"]] },
  { title: "منع التلاعب", fields: [["dailyMaxEarnTxns", "سقف العمليات اليومية للعميل"], ["dailyMaxEarnPoints", "سقف النقاط اليومية للعميل"], ["cooldownSeconds", "الانتظار بين عمليتين (ثانية)"], ["manualMaxPerShift", "حد الإضافات اليدوية بالوردية"], ["manualMaxPointsPerShift", "حد نقاط الإضافات اليدوية بالوردية"], ["shiftHours", "مدة الوردية (ساعة)"], ["redeemMaxAttempts", "محاولات كود الاستبدال قبل القفل"], ["redeemLockBaseMinutes", "مدة القفل الأولى (دقيقة)"]] },
  { title: "الدوام والتنبيهات", fields: [["openMinute", "بداية الدوام", "time"], ["closeMinute", "نهاية الدوام", "time"], ["alertSameCustomerCount", "تنبيه: إضافات لنفس العميل"], ["alertSameCustomerWindowHours", "خلال (ساعة)"], ["alertRedemptionsCount", "تنبيه: استبدالات متتالية"], ["alertRedemptionsWindowHours", "خلال (ساعة)"]] },
  { title: "المستويات", fields: [["silverSpendSar", "فضي: إنفاق سنوي (ريال)"], ["goldSpendSar", "ذهبي: إنفاق سنوي (ريال)"], ["silverMultiplierPct", "مضاعِف الفضي %"], ["goldMultiplierPct", "مضاعِف الذهبي %"]] },
  { title: "الصلاحية والمكافآت", fields: [["pointsExpiryDays", "صلاحية النقاط (يوم، 0 = دائمة)"], ["expiryWarningDays", "التنبيه قبل الانتهاء (يوم)"], ["signupBonus", "مكافأة التسجيل"], ["birthdayBonus", "هدية الميلاد"], ["referralBonusReferrer", "إحالة: للمُحيل"], ["referralBonusReferee", "إحالة: للمُحال"], ["referralMonthlyCap", "سقف الإحالات الشهري"]] },
  { title: "الرسائل", fields: [["promoWeeklyCap", "أقصى رسائل ترويجية أسبوعياً"], ["quietStartMinute", "بداية منع الرسائل", "time"], ["quietEndMinute", "نهاية منع الرسائل", "time"]] },
];

function SettingsTab() {
  const { data, error, reload } = useLoad<Any>("/api/admin/settings");
  if (!data) return <Err text={error} />;
  return <SettingsForm key={data.updatedAt} initial={data} onSaved={reload} />;
}

function SettingsForm({ initial, onSaved }: { initial: Any; onSaved: () => void }) {
  const [form, setForm] = useState<Any>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reload = onSaved;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const patch: Any = {};
    for (const g of SETTINGS_GROUPS) for (const [k] of g.fields) patch[k] = Number(form[k]);
    patch.programMode = form.programMode;
    patch.offerMessage = form.offerMessage ?? "";
    try {
      await api("/api/admin/settings", { method: "PATCH", body: patch });
      setMsg({ ok: true, text: "تم الحفظ وتسجيل التغيير في سجل التدقيق" });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }
  return (
    <form className="stack" onSubmit={save}>
      <div className="panel stack">
        <h2>نوع البرنامج</h2>
        <select value={form.programMode} onChange={(e) => setForm({ ...form, programMode: e.target.value })} aria-label="نوع البرنامج">
          <option value="POINTS">نقاط بنسبة من المبلغ</option>
          <option value="STAMPS">أختام: ختم لكل كوب</option>
        </select>
        {form.programMode === "STAMPS" && (
          <p className="muted small">
            مثال: 5 أكواب يعني أن السادس مجاناً. الكاشير يدخل عدد الأكواب مع كل طلب، والنظام يرفض عدداً أكبر من قيمة الطلب.
            تكلفة مكافأة «الكوب المجاني» تُضبط من تبويب المكافآت ويجب أن تساوي عدد الأكواب.
          </p>
        )}
      </div>
      <div className="panel stack">
        <h2>رسالة العرض على البطاقات</h2>
        <textarea maxLength={140} rows={2} value={form.offerMessage ?? ""} onChange={(e) => setForm({ ...form, offerMessage: e.target.value })} aria-label="رسالة العرض" />
        <p className="muted small">تغييرها يرسل إشعاراً للعملاء (عدا من أوقف العروض أو تجاوز الحد الأسبوعي)، ولا تُرسل ليلاً.</p>
      </div>
      {SETTINGS_GROUPS.map((g) => (
        <div className="panel" key={g.title}>
          <h2>{g.title}</h2>
          <div className="grid2">
            {g.fields.map(([k, label, kind]) => (
              <div key={k}>
                <label htmlFor={k}>{label}</label>
                {kind === "time" ? (
                  <input id={k} type="time" value={toHHMM(form[k])} onChange={(e) => setForm({ ...form, [k]: fromHHMM(e.target.value) ?? 0 })} />
                ) : kind === "sar" ? (
                  <input id={k} type="number" min={0} value={Math.round((form[k] ?? 0) / 100)} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) * 100 })} />
                ) : (
                  <input id={k} type="number" min={0} value={form[k] ?? 0} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {msg && <div className={`alert ${msg.ok ? "alert-ok" : "alert-error"}`}>{msg.text}</div>}
      <button>حفظ الإعدادات</button>
    </form>
  );
}

function Audit() {
  const { data, error } = useLoad<Any[]>("/api/admin/audit");
  return (
    <section className="panel table-wrap">
      <Err text={error} />
      <table>
        <thead><tr><th>الوقت</th><th>العملية</th><th>قبل</th><th>بعد</th><th>IP</th></tr></thead>
        <tbody>
          {data?.map((a) => (
            <tr key={a.id}>
              <td className="small">{fmtDate(a.createdAt)}</td>
              <td>{a.action}</td>
              <td className="small ltr">{a.before ? JSON.stringify(a.before) : ""}</td>
              <td className="small ltr">{a.after ? JSON.stringify(a.after) : ""}</td>
              <td className="small ltr">{a.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
