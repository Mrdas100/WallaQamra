import type { Design, StampStyle } from "@/modules/design/config";

// مكتبة الأختام: كل نوع له ثلاث حالات (فارغ / مكتمل / مكافأة).
// الأشكال المتجهية تأخذ ألوانها من متغيرات القالب، فتتغير مع أي لون يختاره المدير.

export type StampState = "empty" | "filled" | "reward";

const CUP = "M17 12C17 22 22 28 22 36C22 42 19 46 19 50L45 50C45 46 42 42 42 36C42 28 47 22 47 12Z";

function Saucer({ color }: { color: string }) {
  return <ellipse cx="32" cy="53" rx="19" ry="3.6" fill={color} />;
}

function Cup3D({ state, uid }: { state: StampState; uid: string }) {
  const empty = state === "empty";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7743c" />
          <stop offset="1" stopColor="#6d1d10" />
        </linearGradient>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".35" stopColor="#fff" stopOpacity=".12" />
          <stop offset="1" stopColor="#fff" stopOpacity=".35" />
        </linearGradient>
        <radialGradient id={`${uid}s`} cx=".5" cy=".3" r=".7">
          <stop offset="0" stopColor="#fffaf2" />
          <stop offset="1" stopColor="#e6d7c2" />
        </radialGradient>
        <clipPath id={`${uid}c`}>
          <path d={CUP} />
        </clipPath>
      </defs>
      <ellipse cx="32" cy="56" rx="18" ry="3" fill="#000" opacity=".22" />
      <ellipse cx="32" cy="52.5" rx="19.5" ry="4.2" fill={`url(#${uid}s)`} stroke={empty ? "var(--qc-empty)" : "var(--qc-accent)"} strokeWidth="1" />
      <path d={CUP} fill={empty ? "var(--qc-empty)" : "#fff"} opacity={empty ? 0.35 : 0.18} />
      {!empty && (
        <g clipPath={`url(#${uid}c)`}>
          <rect className="qc-tea" x="10" y="18" width="44" height="34" fill={`url(#${uid}t)`} />
          <ellipse className="qc-tea" cx="32" cy="18.4" rx="13.6" ry="1.6" fill="#e59a5f" />
        </g>
      )}
      <path d={CUP} fill={`url(#${uid}g)`} />
      <path d={CUP} fill="none" stroke={empty ? "var(--qc-empty)" : "#fff"} strokeOpacity={empty ? 1 : 0.55} strokeWidth="1.1" />
      <ellipse cx="32" cy="12" rx="15" ry="1.8" fill="none" stroke={empty ? "var(--qc-empty)" : "var(--qc-accent)"} strokeWidth="1.4" />
      <path d="M21.5 17C22 25 25 29 25.5 35" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      {state === "reward" && <Sparkle x={50} y={12} r={7} />}
    </svg>
  );
}

function CupFlat({ state }: { state: StampState }) {
  const c = state === "empty" ? "var(--qc-empty)" : state === "reward" ? "var(--qc-accent)" : "var(--qc-fill)";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      {state !== "empty" && (
        <g className="qc-steam" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" opacity=".7">
          <path d="M27 8c-2 2 2 4 0 6" />
          <path d="M33 5c-2 2 2 4 0 6" />
          <path d="M39 8c-2 2 2 4 0 6" />
        </g>
      )}
      <path d={CUP} fill={c} opacity={state === "empty" ? 0.6 : 1} />
      {state !== "empty" && <path className="qc-tea" d="M18.6 19h26.8C44 25 42 29 42 36c0 6 3 10 3 14H19c0-4 3-8 3-14 0-7-2-11-3.4-17Z" fill="var(--qc-bg)" opacity=".28" />}
      <Saucer color={c} />
      {state === "reward" && <Sparkle x={50} y={14} r={7} />}
    </svg>
  );
}

function CupLine({ state }: { state: StampState }) {
  const c = state === "empty" ? "var(--qc-empty)" : state === "reward" ? "var(--qc-accent)" : "var(--qc-fill)";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {state !== "empty" && <path className="qc-tea" d="M19.6 22h24.8C43 27 42 31 42 36c0 6 3 10 3 13H19c0-3 3-7 3-13 0-5-1-9-2.4-14Z" fill={c} stroke="none" opacity=".35" />}
      <path d={CUP} strokeDasharray={state === "empty" ? "3 4" : undefined} />
      <path d="M12 54h40" />
      {state === "reward" && <Sparkle x={50} y={14} r={7} />}
    </svg>
  );
}

function Crescent({ state }: { state: StampState }) {
  const c = state === "empty" ? "var(--qc-empty)" : state === "reward" ? "var(--qc-accent)" : "var(--qc-fill)";
  const d = "M40 10a22 22 0 1 0 14 34A18 18 0 1 1 40 10Z";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d={d} fill={state === "empty" ? "none" : c} stroke={c} strokeWidth="2.2" strokeLinejoin="round" />
      {state === "reward" && <Sparkle x={44} y={26} r={8} />}
    </svg>
  );
}

function star8(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.72;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function Star({ state }: { state: StampState }) {
  const c = state === "empty" ? "var(--qc-empty)" : state === "reward" ? "var(--qc-accent)" : "var(--qc-fill)";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <polygon points={star8(32, 32, 26)} fill={state === "empty" ? "none" : c} stroke={c} strokeWidth="2" strokeLinejoin="round" />
      {state !== "empty" && <circle cx="32" cy="32" r="8" fill="var(--qc-bg)" opacity=".35" />}
      {state === "reward" && <polygon points={star8(32, 32, 7)} fill="var(--qc-bg)" />}
    </svg>
  );
}

function Seal({ state }: { state: StampState }) {
  const c = state === "empty" ? "var(--qc-empty)" : state === "reward" ? "var(--qc-accent)" : "var(--qc-fill)";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="none" stroke={c} strokeWidth="2" strokeDasharray={state === "empty" ? "3 4" : undefined} />
      {state !== "empty" && (
        <g transform="rotate(-14 32 32)">
          <circle cx="32" cy="32" r="21" fill="none" stroke={c} strokeWidth="1.3" />
          <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill={c} fontFamily="var(--font-kufi), sans-serif">
            {state === "reward" ? "مجاني" : "قمرا"}
          </text>
        </g>
      )}
    </svg>
  );
}

function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <path
      className="qc-sparkle"
      d={`M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`}
      fill="var(--qc-accent)"
      stroke="var(--qc-bg)"
      strokeWidth=".8"
    />
  );
}

/** رابط صورة حالة ختم (للأنواع المعتمدة على صور) أو null للأنواع المتجهية */
export function stampImageSrc(design: Design, state: StampState): string | null {
  if (design.stamp.style === "photo") return `/library/photo-${state}.png`;
  if (design.stamp.style === "takeaway") return `/library/takeaway-${state}.png`;
  if (design.stamp.style === "custom") {
    const id = design.stamp.custom[state];
    return id ? `/media/${id}` : `/library/photo-${state}.png`;
  }
  return null;
}

export function StampArt({ style, state, uid, design }: { style: StampStyle; state: StampState; uid: string; design: Design }) {
  const src = stampImageSrc({ ...design, stamp: { ...design.stamp, style } }, state);
  if (src) {
    return <img src={src} alt="" draggable={false} className={state === "empty" && style === "photo" ? "qc-img-empty" : undefined} />;
  }
  switch (style) {
    case "3d":
      return <Cup3D state={state} uid={uid} />;
    case "flat":
      return <CupFlat state={state} />;
    case "line":
      return <CupLine state={state} />;
    case "crescent":
      return <Crescent state={state} />;
    case "star":
      return <Star state={state} />;
    default:
      return <Seal state={state} />;
  }
}
