"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyTemplate,
  COLOR_KEYS,
  COLOR_LABELS,
  contrast,
  DECOR_LABELS,
  DECORS,
  DEFAULT_TEXTS,
  defaultSlides,
  DesignSchema,
  FONT_LABELS,
  FONTS,
  LAYOUT_LABELS,
  LAYOUTS,
  MAX_SLIDES,
  SHAPE_LABELS,
  STAMP_SHAPES,
  STAMP_STYLE_LABELS,
  STAMP_STYLES,
  TEMPLATE_IDS,
  TEMPLATE_LABELS,
  type Design,
  type Slide,
  type StampStyle,
  type TemplateId,
} from "@/modules/design/config";
import { api } from "@/ui/api";
import LoyaltyCard, { type CardData } from "@/ui/card/loyalty-card";
import { StampArt } from "@/ui/card/stamp-art";

// محرر «تصميم بطاقة الولاء»: يعدّل المسودة فقط، والمعاينة حية على نموذج جوال.
// النشر خطوة منفصلة بتأكيد صريح، فالعملاء لا يرون أي تغيير قبلها.

interface DesignState {
  draft: Design;
  published: Design;
  draftVersion: number;
  publishedVersion: number;
  dirty: boolean;
  publishedAt: string | null;
}

interface Preview {
  mode: "STAMPS" | "POINTS";
  goal: number;
  reward: CardData["reward"];
}

const SAMPLE_QR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h21v21H0z"/><path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0zM1 1v5h5V1zM15 1v5h5V1zM1 15v5h5v-5zM2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2zM8 1h1v2H8zM10 0h2v1h-2zM9 3h3v1H9zM8 5h2v2H8zM11 5h1v3h-1zM8 8h2v1H8zM0 8h2v1H0zM3 8h3v1H3zM12 8h3v1h-3zM16 8h5v1h-5zM1 10h3v1H1zM6 9h3v2H6zM10 10h4v1h-4zM15 10h2v2h-2zM18 10h3v1h-3zM0 12h2v1H0zM4 12h4v1H4zM9 12h2v2H9zM13 12h1v3h-1zM19 12h2v3h-2zM8 14h1v3H8zM10 15h2v1h-2zM15 14h3v1h-3zM14 16h2v2h-2zM17 16h2v2h-2zM9 18h3v1H9zM13 19h3v2h-3zM18 19h3v1h-3zM8 20h1v1H8z" fill="#000"/></svg>';

export default function DesignEditor({ nonce }: { nonce: string }) {
  const [state, setState] = useState<DesignState | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [preview, setPreview] = useState<Preview>({ mode: "STAMPS", goal: 5, reward: null });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    Promise.all([
      api<DesignState>("/api/admin/design"),
      api<{ programMode: "STAMPS" | "POINTS"; stampsPerReward: number; rewardThreshold: number }>("/api/admin/settings"),
      api<{ name: string; description: string; cost: number; active: boolean; unit: string }[]>("/api/admin/rewards"),
    ]).then(
      ([d, s, rewards]) => {
        setState(d);
        setDesign(d.draft);
        const unit = s.programMode === "STAMPS" ? "STAMP" : "POINT";
        const r = rewards.find((x) => x.active && x.unit === unit);
        setPreview({
          mode: s.programMode,
          goal: s.programMode === "STAMPS" ? s.stampsPerReward : s.rewardThreshold,
          reward: r ? { name: r.name, description: r.description, cost: r.cost } : null,
        });
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  const unsaved = useMemo(() => !!state && !!design && JSON.stringify(design) !== JSON.stringify(state.draft), [state, design]);
  const validation = useMemo(() => (design ? DesignSchema.safeParse(design) : null), [design]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!state || !design) return <p className="muted">جارٍ التحميل…</p>;

  // تحديث وظيفي: رفع الصور ينتهي بعد لحظات، فلا نعتمد على نسخة قديمة من التصميم
  const set: SetFn = (patch) => setDesign((d) => (d ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d));

  async function run(fn: () => Promise<DesignState>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const d = await fn();
      setState(d);
      setDesign(d.draft);
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const saveDraft = () => run(() => api<DesignState>("/api/admin/design", { method: "PUT", body: { design } }), "تم حفظ المسودة. العملاء ما زالوا يرون التصميم المنشور.");
  const publish = () =>
    run(
      () => api<DesignState>("/api/admin/design/publish", { method: "POST", body: { draftVersion: state.draftVersion, confirm: true } }),
      "تم النشر. كل العملاء يرون التصميم الجديد الآن.",
    ).then(() => setConfirming(false));
  const discard = () => run(() => api<DesignState>("/api/admin/design/discard", { method: "POST" }), "رجعت المسودة إلى التصميم المنشور.");

  const statusText = unsaved
    ? "تغييرات غير محفوظة"
    : state.dirty
      ? `مسودة محفوظة (نسخة ${state.draftVersion}) لم تُنشر بعد`
      : state.publishedVersion > 0
        ? "المسودة مطابقة للتصميم المنشور"
        : "التصميم الافتراضي (لم يُنشر تصميم مخصص بعد)";

  return (
    <section className="de">
      <div className="de-bar panel">
        <div>
          <b>تصميم بطاقة الولاء</b>
          <div className={`small ${unsaved ? "de-warn" : "muted"}`} role="status">
            {statusText}
          </div>
        </div>
        <div className="row">
          <button type="button" onClick={saveDraft} disabled={busy || !unsaved || !validation?.success}>
            حفظ كمسودة
          </button>
          <button type="button" className="btn-gold" onClick={() => setConfirming(true)} disabled={busy || unsaved || !state.dirty}>
            نشر للعملاء
          </button>
          <details className="de-more">
            <summary className="btn btn-ghost btn-sm">المزيد</summary>
            <div className="stack de-menu">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setDesign(applyTemplate(design.template))}>
                إعادة القيم الافتراضية للقالب
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setDesign(state.draft)} disabled={!unsaved}>
                تراجع عن التغييرات غير المحفوظة
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={discard} disabled={busy || !state.dirty}>
                حذف المسودة والرجوع للمنشور
              </button>
            </div>
          </details>
        </div>
      </div>
      {validation && !validation.success && <div className="alert alert-error">{validation.error.issues[0]?.message ?? "قيمة غير صالحة"}</div>}
      {msg && <div className={`alert ${msg.ok ? "alert-ok" : "alert-error"}`}>{msg.text}</div>}
      {confirming && (
        <div className="panel de-confirm" role="alertdialog" aria-labelledby="de-confirm-t">
          <h2 id="de-confirm-t">نشر التصميم لكل العملاء؟</h2>
          <p className="small">سيظهر التصميم في صفحة البطاقة لكل العملاء فوراً. الأرصدة والأختام وQR لا تتأثر. بطاقة Apple وGoogle Wallet تبقى كما هي.</p>
          <div className="row">
            <button type="button" className="btn-gold" onClick={publish} disabled={busy}>
              نعم، انشر الآن
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="de-grid">
        <div className="de-controls stack">
          <Templates design={design} preview={preview} nonce={nonce} onPick={(id) => setDesign(applyTemplate(id, design))} />
          <ColorsPanel design={design} set={set} />
          <LayoutPanel design={design} set={set} />
          <StampsPanel design={design} set={set} nonce={nonce} />
          <ImagesPanel design={design} set={set} />
          <TextsPanel design={design} set={set} />
          <EffectsPanel design={design} set={set} />
          <SlidesPanel design={design} set={set} />
        </div>
        <PhonePreview design={design} preview={preview} nonce={nonce} />
      </div>
    </section>
  );
}

type SetFn = (patch: Partial<Design> | ((d: Design) => Partial<Design>)) => void;

function Templates({ design, preview, nonce, onPick }: { design: Design; preview: Preview; nonce: string; onPick: (id: TemplateId) => void }) {
  return (
    <div className="panel">
      <h2>القوالب الجاهزة</h2>
      <p className="muted small">اختيار قالب يغيّر الألوان والتخطيط والزخرفة ونوع الأختام، ويحتفظ بنصوصك وصورك وسلايداتك.</p>
      <div className="de-templates">
        {TEMPLATE_IDS.map((id) => {
          const t = applyTemplate(id, design);
          const mini = { ...t, effects: { ...t.effects, entrance: false }, slides: t.slides.filter((s) => s.kind === "stamps") };
          return (
            <button key={id} type="button" className="de-tpl" aria-pressed={design.template === id} onClick={() => onPick(id)}>
              <span className="de-tpl-card" aria-hidden="true">
                <LoyaltyCard
                  design={mini}
                  nonce={nonce}
                  data={{ name: "نورة", tierLabel: null, mode: preview.mode, balance: 3, goal: Math.min(preview.goal, 6), unitWord: "ختم", reward: null }}
                  qr={<span dangerouslySetInnerHTML={{ __html: SAMPLE_QR }} />}
                />
              </span>
              <b>{TEMPLATE_LABELS[id].name}</b>
              <span className="muted small">{TEMPLATE_LABELS[id].hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  const id = `c-${label}`;
  return (
    <div className="de-color">
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} — منتقي الألوان`} />
        <input
          id={id}
          className="ltr"
          value={text}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
          }}
          aria-invalid={!/^#[0-9a-fA-F]{6}$/.test(text)}
        />
      </div>
    </div>
  );
}

function ColorsPanel({ design, set }: { design: Design; set: SetFn }) {
  const ratio = contrast(design.colors.text, design.colors.bg);
  const ratio2 = contrast(design.colors.text, design.colors.bg2);
  const low = Math.min(ratio, ratio2) < 4.5;
  return (
    <details className="panel" open>
      <summary>الألوان</summary>
      <div className="de-colors">
        {COLOR_KEYS.map((k) => (
          <ColorField key={k} label={COLOR_LABELS[k]} value={design.colors[k]} onChange={(v) => set({ colors: { ...design.colors, [k]: v } })} />
        ))}
      </div>
      <p className={`small ${low ? "de-warn" : "muted"}`}>
        تباين النص مع الخلفية: {Math.min(ratio, ratio2)}:1 {low ? "— أقل من 4.5:1، قد يصعب القراءة على بعض الشاشات" : "— ممتاز للقراءة"}
      </p>
    </details>
  );
}

function Range({ label, value, min, max, onChange, unit = "px" }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; unit?: string }) {
  return (
    <div>
      <label>
        {label}: <b className="ltr">{value}{unit}</b>
      </label>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </div>
  );
}

function LayoutPanel({ design, set }: { design: Design; set: SetFn }) {
  return (
    <details className="panel">
      <summary>التخطيط والخط</summary>
      <div className="grid2">
        <div>
          <label htmlFor="de-layout">التخطيط</label>
          <select id="de-layout" value={design.layout} onChange={(e) => set({ layout: e.target.value as Design["layout"] })}>
            {LAYOUTS.map((l) => (
              <option key={l} value={l}>{LAYOUT_LABELS[l]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="de-decor">الزخرفة</label>
          <select id="de-decor" value={design.decor} onChange={(e) => set({ decor: e.target.value as Design["decor"] })}>
            {DECORS.map((l) => (
              <option key={l} value={l}>{DECOR_LABELS[l]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="de-font">الخط</label>
          <select id="de-font" value={design.font} onChange={(e) => set({ font: e.target.value as Design["font"] })}>
            {FONTS.map((l) => (
              <option key={l} value={l}>{FONT_LABELS[l]}</option>
            ))}
          </select>
        </div>
        <Range label="استدارة الزوايا" value={design.radius} min={8} max={36} onChange={(radius) => set({ radius })} />
      </div>
    </details>
  );
}

function StampsPanel({ design, set, nonce }: { design: Design; set: SetFn; nonce: string }) {
  const stamp = design.stamp;
  const setStamp = (p: Partial<Design["stamp"]>) => set({ stamp: { ...stamp, ...p } });
  return (
    <details className="panel">
      <summary>الأختام والأكواب</summary>
      <p className="muted small">لكل نوع ثلاث حالات: فارغ، مكتمل، مكافأة. الأنواع المتجهية تأخذ ألوان القالب تلقائياً.</p>
      <div className="de-lib qc" data-qc="lib" data-shape={stamp.shape}>
        <style nonce={nonce}>{`[data-qc="lib"]{--qc-bg:${design.colors.bg};--qc-bg2:${design.colors.bg2};--qc-text:${design.colors.text};--qc-accent:${design.colors.accent};--qc-fill:${design.colors.stampFill};--qc-empty:${design.colors.stampEmpty}}`}</style>
        {STAMP_STYLES.map((s: StampStyle) => (
          <button key={s} type="button" className="de-lib-item" aria-pressed={stamp.style === s} onClick={() => setStamp({ style: s })}>
            <span className="de-lib-row" aria-hidden="true">
              {(["empty", "filled", "reward"] as const).map((st) => (
                <span key={st} className={`qc-stamp is-${st}`}>
                  <StampArt style={s} state={st} uid={`lib${s}${st}`} design={design} />
                </span>
              ))}
            </span>
            <span className="small">{STAMP_STYLE_LABELS[s]}</span>
          </button>
        ))}
      </div>
      {stamp.style === "custom" && (
        <div className="grid2 de-custom">
          {(["empty", "filled", "reward"] as const).map((st) => (
            <Uploader
              key={st}
              kind="stamp"
              label={st === "empty" ? "صورة الختم الفارغ" : st === "filled" ? "صورة الختم المكتمل" : "صورة المكافأة"}
              value={stamp.custom[st]}
              onChange={(id) => set((d) => ({ stamp: { ...d.stamp, custom: { ...d.stamp.custom, [st]: id } } }))}
            />
          ))}
        </div>
      )}
      <div className="grid2">
        <div>
          <label htmlFor="de-shape">إطار الختم</label>
          <select id="de-shape" value={stamp.shape} onChange={(e) => setStamp({ shape: e.target.value as Design["stamp"]["shape"] })}>
            {STAMP_SHAPES.map((s) => (
              <option key={s} value={s}>{SHAPE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <Range label="حجم الختم" value={stamp.size} min={28} max={80} onChange={(size) => setStamp({ size })} />
        <Range label="المسافة بين الأختام" value={stamp.gap} min={4} max={24} onChange={(gap) => setStamp({ gap })} />
      </div>
      <p className="muted small">الحجم هو الحد الأقصى؛ على الشاشات الصغيرة تصغر الأختام تلقائياً لتبقى كلها داخل البطاقة.</p>
    </details>
  );
}

function Uploader({ kind, label, value, onChange }: { kind: "logo" | "stamp" | "background" | "slide"; label: string; value: string | null; onChange: (id: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function upload(file: File) {
    setErr("");
    if (file.size > 1_500_000) return setErr("حجم الصورة أكبر من 1.5 ميجابايت");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setErr("الصيغ المسموحة: PNG أو JPG أو WebP");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await fetch("/api/admin/design/assets", { method: "POST", body: fd, credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { id: string }; error?: { message: string } };
      if (!res.ok || !json.ok || !json.data) throw new Error(json.error?.message ?? "تعذر رفع الصورة");
      onChange(json.data.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div className="de-up">
      <span className="small">{label}</span>
      <div className="row">
        <span className="de-thumb">{value ? <img src={`/media/${value}`} alt="" /> : <span className="muted small">لا توجد</span>}</span>
        <button type="button" className="btn-ghost btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? "جارٍ الرفع…" : value ? "تغيير" : "رفع صورة"}
        </button>
        {value && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}>
            إزالة
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label={label} />
      {err && <span className="small de-warn">{err}</span>}
    </div>
  );
}

function ImagesPanel({ design, set }: { design: Design; set: SetFn }) {
  return (
    <details className="panel">
      <summary>الشعار والخلفية</summary>
      <div className="stack">
        <Uploader kind="logo" label="شعار المحل (PNG شفاف مربع يفضل 512×512)" value={design.logoAssetId} onChange={(logoAssetId) => set({ logoAssetId })} />
        <Uploader kind="background" label="صورة خلفية البطاقة (اختياري)" value={design.background.assetId} onChange={(assetId) => set((d) => ({ background: { ...d.background, assetId } }))} />
        {design.background.assetId && (
          <Range label="وضوح الخلفية" unit="%" value={design.background.opacity} min={0} max={100} onChange={(opacity) => set({ background: { ...design.background, opacity } })} />
        )}
        <p className="muted small">PNG أو JPG أو WebP حتى 1.5 ميجابايت. لا نقبل SVG لأسباب أمنية.</p>
      </div>
    </details>
  );
}

function TextsPanel({ design, set }: { design: Design; set: SetFn }) {
  const t = design.texts;
  const field = (k: keyof Design["texts"], label: string, max: number) => (
    <div key={k}>
      <label htmlFor={`de-t-${k}`}>{label}</label>
      <input id={`de-t-${k}`} maxLength={max} value={t[k]} placeholder={DEFAULT_TEXTS[k]} onChange={(e) => set({ texts: { ...t, [k]: e.target.value } })} />
    </div>
  );
  return (
    <details className="panel">
      <summary>النصوص ورسائل المكافأة</summary>
      <div className="stack">
        {field("title", "اسم المحل على البطاقة", 40)}
        {field("subtitle", "سطر تحت الاسم", 60)}
        {field("progress", "رسالة التقدم", 80)}
        {field("rewardReady", "رسالة اكتمال الأختام", 80)}
        {field("qrHint", "نص بجانب QR", 40)}
        <p className="muted small">
          متغيرات تُستبدل تلقائياً: <code className="ltr">{"{remaining}"}</code> المتبقي، <code className="ltr">{"{goal}"}</code> عدد الأختام،{" "}
          <code className="ltr">{"{balance}"}</code> الرصيد، <code className="ltr">{"{name}"}</code> اسم العميل.
        </p>
      </div>
    </details>
  );
}

function EffectsPanel({ design, set }: { design: Design; set: SetFn }) {
  const fx = design.effects;
  const items: [keyof Design["effects"], string][] = [
    ["entrance", "ظهور سلس للبطاقة عند الفتح"],
    ["fill", "امتلاء الكوب عند إضافة ختم جديد"],
    ["celebrate", "احتفال خفيف عند اكتمال الأختام"],
    ["shine", "لمعة على المكافأة المستحقة"],
  ];
  return (
    <details className="panel">
      <summary>الحركات والمؤثرات</summary>
      <div className="stack">
        {items.map(([k, label]) => (
          <label key={k} className="row de-check">
            <input type="checkbox" className="checkbox" checked={fx[k]} onChange={(e) => set({ effects: { ...fx, [k]: e.target.checked } })} />
            {label}
          </label>
        ))}
        <p className="muted small">الحركات تتوقف تلقائياً لمن فعّل «تقليل الحركة» في جواله، ولا توجد حركة مستمرة.</p>
      </div>
    </details>
  );
}

function SlidesPanel({ design, set }: { design: Design; set: SetFn }) {
  const slides = design.slides;
  const update = (i: number, p: Partial<Slide>) => set({ slides: slides.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 1 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    set({ slides: next });
  };
  const add = (kind: Slide["kind"]) => {
    const id = `${kind}-${Date.now().toString(36).slice(-5)}`;
    const base = defaultSlides().find((s) => s.kind === kind);
    set({
      slides: [
        ...slides,
        { id, kind, enabled: true, title: base?.title ?? "عنوان جديد", body: base?.body ?? "", imageAssetId: null, template: null },
      ],
    });
  };
  const KIND: Record<Slide["kind"], string> = { stamps: "الأختام وQR (أساسي)", reward: "المكافأة", offer: "عرض", custom: "صفحة مخصصة" };
  return (
    <details className="panel" open>
      <summary>السلايدات ({slides.length} من {MAX_SLIDES})</summary>
      <ol className="de-slides">
        {slides.map((s, i) => (
          <li key={s.id} className={`de-slide${s.enabled ? "" : " is-off"}`}>
            <div className="row spread">
              <b>
                {i + 1}. {KIND[s.kind]}
              </b>
              {s.kind !== "stamps" && (
                <div className="row">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i <= 1} aria-label="تحريك للأعلى">
                    ↑
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label="تحريك للأسفل">
                    ↓
                  </button>
                  <label className="row de-check small">
                    <input type="checkbox" className="checkbox" checked={s.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
                    مفعّل
                  </label>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => set({ slides: slides.filter((_, j) => j !== i) })}>
                    حذف
                  </button>
                </div>
              )}
            </div>
            {s.kind === "stamps" ? (
              <p className="muted small">يبقى أولاً ومفعّلاً دائماً لأنه يحمل الأختام وQR.</p>
            ) : (
              <div className="stack">
                <div className="grid2">
                  <div>
                    <label htmlFor={`sl-t-${s.id}`}>العنوان</label>
                    <input id={`sl-t-${s.id}`} maxLength={50} value={s.title} onChange={(e) => update(i, { title: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`sl-tpl-${s.id}`}>القالب</label>
                    <select id={`sl-tpl-${s.id}`} value={s.template ?? ""} onChange={(e) => update(i, { template: (e.target.value || null) as TemplateId | null })}>
                      <option value="">نفس قالب البطاقة</option>
                      {TEMPLATE_IDS.map((t) => (
                        <option key={t} value={t}>{TEMPLATE_LABELS[t].name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor={`sl-b-${s.id}`}>النص</label>
                  <textarea id={`sl-b-${s.id}`} rows={2} maxLength={160} value={s.body} onChange={(e) => update(i, { body: e.target.value })} />
                </div>
                <Uploader kind="slide" label={s.kind === "reward" ? "صورة الكوب (اختياري)" : "صورة المنتج أو العرض"} value={s.imageAssetId} onChange={(imageAssetId) => set((d) => ({ slides: d.slides.map((x) => (x.id === s.id ? { ...x, imageAssetId } : x)) }))} />
              </div>
            )}
          </li>
        ))}
      </ol>
      {slides.length < MAX_SLIDES && (
        <div className="row">
          <button type="button" className="btn-ghost btn-sm" onClick={() => add("offer")}>+ سلايد عرض</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => add("custom")}>+ صفحة مخصصة</button>
          {!slides.some((s) => s.kind === "reward") && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => add("reward")}>+ سلايد المكافأة</button>
          )}
        </div>
      )}
    </details>
  );
}

function PhonePreview({ design, preview, nonce }: { design: Design; preview: Preview; nonce: string }) {
  const [balance, setBalance] = useState(3);
  const [from, setFrom] = useState(3);
  const [run, setRun] = useState(0);
  const goal = preview.goal;
  const b = Math.min(balance, goal);
  const replay = (to: number, fromValue: number) => {
    setBalance(to);
    setFrom(fromValue);
    setRun((r) => r + 1);
  };
  return (
    <aside className="de-preview">
      <div className="de-phone" aria-label="معاينة مباشرة على جوال">
        <div className="de-notch" aria-hidden="true" />
        <div className="de-screen">
          <LoyaltyCard
            key={run}
            design={design}
            nonce={nonce}
            animateFrom={from}
            label="معاينة البطاقة"
            data={{ name: "نورة العتيبي", tierLabel: "برونزي", mode: preview.mode, balance: b, goal, unitWord: preview.mode === "STAMPS" ? "ختم" : "نقطة", reward: preview.reward }}
            qr={<span dangerouslySetInnerHTML={{ __html: SAMPLE_QR }} />}
          />
        </div>
      </div>
      <div className="panel stack de-sim">
        <Range label="رصيد المعاينة" unit="" value={b} min={0} max={goal} onChange={(v) => replay(v, v)} />
        <div className="row">
          <button type="button" className="btn-ghost btn-sm" onClick={() => replay(Math.min(goal, b + 1), b)} disabled={b >= goal}>
            جرّب إضافة ختم
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => replay(goal, Math.max(0, goal - 1))}>
            جرّب اكتمال الأختام
          </button>
        </div>
        <p className="muted small">المعاينة تعرض المسودة الحالية. اسحب البطاقة يميناً ويساراً لرؤية السلايدات.</p>
      </div>
    </aside>
  );
}
