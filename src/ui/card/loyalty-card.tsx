"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cssBlock, cssVars, fillText, slideColors, type Design, type Slide } from "@/modules/design/config";
import { StampArt, stampImageSrc, type StampState } from "./stamp-art";

// بطاقة الولاء: مكوّن واحد تستخدمه صفحة العميل ومعاينة لوحة الإدارة والصفحة الرئيسية.
// كل الألوان والأبعاد تُكتب في <style nonce> واحد (CSP يمنع style="" في الإنتاج).

export interface CardData {
  name: string;
  tierLabel: string | null;
  mode: "STAMPS" | "POINTS";
  balance: number;
  goal: number;
  unitWord: string;
  reward: { name: string; description: string; cost: number } | null;
}

interface Props {
  design: Design;
  data: CardData;
  nonce?: string;
  /** محتوى QR (SVG) — يظهر داخل سلايد الأختام */
  qr?: ReactNode;
  /** الرصيد السابق: الأختام بين السابق والحالي تمتلئ بحركة */
  animateFrom?: number;
  label?: string;
}

const ARC_FROM = 8;
const ARC_TO = 172;

function layoutCss(scope: string, d: Design, slots: number): string {
  const sel = `[data-qc="${scope}"]`;
  const perRow = slots <= 6 ? slots : Math.ceil(slots / 2);
  let css = `${sel} .qc-grid{grid-template-columns:repeat(${perRow},minmax(0,var(--qc-stamp)));--qc-n:${Math.max(1, slots)}}`;
  if (d.layout === "arc") {
    for (let i = 0; i < slots; i++) {
      const t = slots === 1 ? 0.5 : i / (slots - 1);
      // قوس علوي: الختم الأول على اليمين (RTL) والمجاني على اليسار
      const a = ((ARC_FROM + (ARC_TO - ARC_FROM) * t) * Math.PI) / 180;
      const x = 50 + 42 * Math.cos(a);
      const y = 82 - 64 * Math.sin(a);
      css += `${sel} .qc-arc .qc-s${i}{left:${x.toFixed(2)}%;top:${y.toFixed(2)}%}`;
    }
    const size = Math.min(d.stamp.size, Math.floor(260 / Math.max(5, slots)));
    css += `${sel} .qc-arc{--qc-arc-size:${size}px}`;
  }
  return css;
}

export function designCss(scope: string, d: Design, slots: number): string {
  let css = cssBlock(`[data-qc="${scope}"]`, cssVars(d));
  for (const s of d.slides) {
    if (s.template) css += cssBlock(`[data-qc="${scope}"] [data-slide="${s.id}"]`, cssVars(d, slideColors(d, s)));
  }
  return css + layoutCss(scope, d, slots);
}

export default function LoyaltyCard({ design, data, nonce, qr, animateFrom, label }: Props) {
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");
  const slides = design.slides.filter((s) => s.enabled);
  const stamps = data.mode === "STAMPS";
  const slots = stamps ? data.goal + 1 : 0;
  const css = useMemo(() => designCss(scope, design, slots), [scope, design, slots]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const from = animateFrom ?? data.balance;
  const celebrate = design.effects.celebrate && stamps && from < data.goal && data.balance >= data.goal;

  // السلايد الظاهر حالياً (يعمل مع RTL بدون حساب scrollLeft)
  useEffect(() => {
    const track = trackRef.current;
    if (!track || slides.length < 2) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root: track, threshold: 0.6 },
    );
    track.querySelectorAll<HTMLElement>(".qc-slide").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [slides.length]);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current?.querySelectorAll<HTMLElement>(".qc-slide")[i];
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest", inline: "center" });
  }, []);

  const fx = design.effects;
  return (
    <div
      className={`qc${fx.entrance ? " qc-fx-enter" : ""}${fx.fill ? " qc-fx-fill" : ""}${fx.shine ? " qc-fx-shine" : ""}`}
      data-qc={scope}
      data-layout={design.layout}
      data-decor={design.decor}
      data-shape={design.stamp.shape}
      role="region"
      aria-roledescription="carousel"
      aria-label={label ?? "بطاقة الولاء"}
    >
      <style nonce={nonce}>{css}</style>
      <div className="qc-track" ref={trackRef}>
        {slides.map((s, i) => (
          <section
            key={s.id}
            className="qc-slide"
            data-slide={s.id}
            data-index={i}
            aria-roledescription="slide"
            aria-label={`${i + 1} من ${slides.length}`}
          >
            <Decor decor={design.decor} />
            {design.background.assetId && (
              <img className="qc-bgimg" src={`/media/${design.background.assetId}`} alt="" />
            )}
            <div className="qc-body">
              {s.kind === "stamps" ? (
                <StampsFace design={design} data={data} qr={qr} from={from} scope={scope} />
              ) : s.kind === "reward" ? (
                <RewardFace design={design} data={data} slide={s} scope={scope} />
              ) : (
                <OfferFace slide={s} />
              )}
            </div>
          </section>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="qc-dots" role="tablist" aria-label="صفحات البطاقة">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={slideName(s, i)}
              className="qc-dot"
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
      {celebrate && <Confetti />}
    </div>
  );
}

function slideName(s: Slide, i: number): string {
  if (s.kind === "stamps") return "الأختام";
  if (s.kind === "reward") return "المكافأة";
  return s.title || `صفحة ${i + 1}`;
}

function Brand({ design, data }: { design: Design; data: CardData }) {
  // قالب صف الأكواب: شعار شاهي قمرا المكتوب بدل الأيقونة والعنوان، بلون نص القالب
  if (design.layout === "cups") {
    return (
      <header className="qc-head">
        <span className="qc-wordmark" role="img" aria-label={design.texts.title} />
        {data.tierLabel && <span className="qc-chip">{data.tierLabel}</span>}
      </header>
    );
  }
  return (
    <header className="qc-head">
      <img className="qc-logo" src={design.logoAssetId ? `/media/${design.logoAssetId}` : "/icon-192.png"} alt="" />
      <div className="qc-titles">
        <span className="qc-title">{design.texts.title}</span>
        {design.texts.subtitle && <span className="qc-sub">{design.texts.subtitle}</span>}
      </div>
      {data.tierLabel && <span className="qc-chip">{data.tierLabel}</span>}
    </header>
  );
}

function StampsFace({ design, data, qr, from, scope }: { design: Design; data: CardData; qr?: ReactNode; from: number; scope: string }) {
  const stamps = data.mode === "STAMPS";
  const filled = Math.min(data.balance, data.goal);
  const remaining = Math.max(0, data.goal - data.balance);
  const ready = data.balance >= data.goal;
  const vars = { remaining, goal: data.goal, balance: data.balance, name: data.name };
  const status = ready ? fillText(design.texts.rewardReady, vars) : fillText(design.texts.progress, vars);

  return (
    <>
      <Brand design={design} data={data} />
      <div className="qc-name">{data.name}</div>

      {stamps ? (
        <>
          {design.layout === "minimal" && (
            <div className="qc-counter" aria-hidden="true">
              <b>{filled}</b>
              <span>/ {data.goal}</span>
            </div>
          )}
          {design.layout === "cups" && (
            <div className="qc-tally" aria-hidden="true">
              <span>الأختام</span>
              <b>
                {filled}/{data.goal}
              </b>
            </div>
          )}
          <div className={design.layout === "arc" ? "qc-arcwrap" : "qc-stampwrap"}>
            <ol
              className={design.layout === "arc" ? "qc-arc" : "qc-grid"}
              aria-label={`${filled} من ${data.goal} أختام`}
            >
              {Array.from({ length: data.goal + 1 }, (_, i) => {
                const isReward = i === data.goal;
                const state: StampState = isReward ? "reward" : i < filled ? "filled" : "empty";
                const isNew = !isReward && i >= from && i < filled;
                const cls = [
                  "qc-stamp",
                  `qc-s${i}`,
                  `is-${state}`,
                  isNew ? `is-new qc-d${Math.min(9, i - from)}` : "",
                  isReward && ready ? "is-ready" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={i} className={cls}>
                    <StampArt style={design.stamp.style} state={state} uid={`${scope}s${i}`} design={design} />
                    {isReward && <span className="qc-free">مجاني</span>}
                  </li>
                );
              })}
            </ol>
            {design.layout === "arc" && (
              <div className="qc-arc-center" aria-hidden="true">
                <b>{filled}</b>
                <span>من {data.goal}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="qc-points">
          <b>{data.balance}</b>
          <span>{data.unitWord}</span>
        </div>
      )}

      <div className="qc-status" aria-live="polite">
        <div className="qc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={data.goal} aria-valuenow={Math.min(data.balance, data.goal)}>
          <span className={`qc-bar-fill qc-w${Math.round((Math.min(data.balance, data.goal) / Math.max(1, data.goal)) * 20)}`} />
        </div>
        <p className={ready ? "qc-ready" : undefined}>{stamps ? status : ready ? "لديك مكافأة متاحة" : `باقي ${remaining} ${data.unitWord} للمكافأة`}</p>
        {data.balance < 0 && (
          <p className="qc-owed">
            رصيدك ناقص {-data.balance} {data.unitWord} بسبب مرتجع أو تصحيح، وتُعوَّض من أول أختام قادمة
          </p>
        )}
      </div>

      {design.layout === "ticket" && <div className="qc-perf" aria-hidden="true" />}
      <div className="qc-qrbox">
        <div className="qc-qr" aria-label="رمز QR للبطاقة">{qr}</div>
        <span className="qc-qrhint">{design.texts.qrHint}</span>
      </div>
    </>
  );
}

function RewardFace({ design, data, slide, scope }: { design: Design; data: CardData; slide: Slide; scope: string }) {
  const reward = data.reward;
  const ready = reward ? data.balance >= reward.cost : false;
  const left = reward ? Math.max(0, reward.cost - data.balance) : 0;
  return (
    <div className="qc-feature">
      <div className={`qc-hero${ready ? " is-ready" : ""}`}>
        {slide.imageAssetId ? (
          <img src={`/media/${slide.imageAssetId}`} alt="" />
        ) : (
          <StampArt style={stampImageSrc(design, "reward") ? design.stamp.style : "3d"} state="reward" uid={`${scope}rw`} design={design} />
        )}
      </div>
      <h3 className="qc-h">{slide.title || "مكافأتك"}</h3>
      {reward ? (
        <>
          <p className="qc-big">{reward.name}</p>
          {reward.description && <p className="qc-p">{reward.description}</p>}
          <span className={`qc-pill${ready ? " is-ok" : ""}`}>
            {ready ? "مستحقة الآن" : `باقي ${left} ${data.unitWord}`}
          </span>
        </>
      ) : (
        <p className="qc-p">لا توجد مكافآت مفعّلة حالياً.</p>
      )}
      {slide.body && <p className="qc-p qc-how">{slide.body}</p>}
    </div>
  );
}

function OfferFace({ slide }: { slide: Slide }) {
  return (
    <div className="qc-feature">
      <div className="qc-hero qc-hero-wide">
        {slide.imageAssetId ? (
          <img src={`/media/${slide.imageAssetId}`} alt="" />
        ) : (
          <TeapotArt />
        )}
      </div>
      {slide.title && <h3 className="qc-h">{slide.title}</h3>}
      {slide.body && <p className="qc-p">{slide.body}</p>}
    </div>
  );
}

function TeapotArt() {
  // إبريق شاهي (رسم أصلي متجه يأخذ ألوان القالب)
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <g fill="none" stroke="var(--qc-accent)" strokeWidth="2.6" strokeLinecap="round" opacity=".55" className="qc-steam">
        <path d="M118 30c-4 4 4 7 0 11" />
        <path d="M128 24c-4 4 4 7 0 11" />
      </g>
      <ellipse cx="80" cy="108" rx="44" ry="5" fill="var(--qc-text)" opacity=".14" />
      <path d="M50 60C30 58 26 90 52 92" fill="none" stroke="var(--qc-accent)" strokeWidth="6" strokeLinecap="round" />
      <path d="M110 76c12-4 18-18 28-30l5 4c-8 14-16 32-31 38Z" fill="var(--qc-accent)" />
      <path d="M58 104C42 98 40 70 54 57c6-5 9-10 9-17h34c0 7 3 12 9 17 14 13 12 41-4 47Z" fill="var(--qc-accent)" />
      <path d="M62 62c-8 10-8 26-2 36" stroke="var(--qc-bg)" strokeOpacity=".28" strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx="80" cy="40" rx="20" ry="4.5" fill="var(--qc-accent)" />
      <ellipse cx="80" cy="40" rx="20" ry="4.5" fill="var(--qc-bg)" opacity=".18" />
      <path d="M70 39c0-8 4-12 10-12s10 4 10 12Z" fill="var(--qc-accent)" />
      <circle cx="80" cy="24" r="3.5" fill="var(--qc-accent)" />
      <path d="M58 104h44" stroke="var(--qc-bg)" strokeOpacity=".3" strokeWidth="2" />
    </svg>
  );
}

function Decor({ decor }: { decor: Design["decor"] }) {
  if (decor === "ornament") {
    const corner = "M4 34V14Q4 4 14 4H34M10 34V18Q10 10 18 10H34M4 4l8 8";
    return (
      <div className="qc-decor qc-ornament" aria-hidden="true">
        {["tr", "tl", "br", "bl"].map((p) => (
          <svg key={p} className={`qc-corner qc-${p}`} viewBox="0 0 38 38">
            <path d={corner} fill="none" stroke="var(--qc-border)" strokeWidth="1.6" />
            <circle cx="24" cy="24" r="2.2" fill="var(--qc-accent)" />
          </svg>
        ))}
      </div>
    );
  }
  if (decor === "crescent") {
    return (
      <svg className="qc-decor qc-moon" viewBox="0 0 200 120" aria-hidden="true">
        <path d="M58 14a40 40 0 1 0 26 62A33 33 0 1 1 58 14Z" fill="var(--qc-accent)" opacity=".9" />
        {[
          [120, 22, 2.2],
          [150, 40, 1.4],
          [176, 18, 1.8],
          [104, 56, 1.2],
          [186, 64, 1.1],
          [136, 72, 1.6],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="var(--qc-text)" className={`qc-twinkle qc-d${i}`} />
        ))}
      </svg>
    );
  }
  if (decor === "leaves") {
    const leaf = "M0 0C18-6 34 2 40 16C24 20 8 14 0 0Z";
    return (
      <div className="qc-decor qc-leaves" aria-hidden="true">
        <svg className="qc-leaf-a" viewBox="0 0 120 120">
          <path d="M8 112C30 70 60 40 112 10" stroke="var(--qc-accent)" strokeWidth="2" fill="none" opacity=".6" />
          {[
            [28, 82, -40],
            [48, 58, -55],
            [70, 38, -35],
            [92, 22, -60],
          ].map(([x, y, r], i) => (
            <path key={i} d={leaf} transform={`translate(${x} ${y}) rotate(${r})`} fill="var(--qc-accent)" opacity={0.35 + i * 0.1} />
          ))}
        </svg>
        <svg className="qc-leaf-b" viewBox="0 0 120 120">
          <path d="M8 112C30 70 60 40 112 10" stroke="var(--qc-accent)" strokeWidth="2" fill="none" opacity=".45" />
          {[
            [30, 80, -40],
            [56, 50, -50],
            [84, 28, -45],
          ].map(([x, y, r], i) => (
            <path key={i} d={leaf} transform={`translate(${x} ${y}) rotate(${r})`} fill="var(--qc-accent)" opacity={0.3 + i * 0.1} />
          ))}
        </svg>
      </div>
    );
  }
  if (decor === "blobs") {
    return (
      <div className="qc-decor qc-blobs" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    );
  }
  return null;
}

function Confetti() {
  return (
    <div className="qc-confetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className={`qc-c${i}`} />
      ))}
    </div>
  );
}
