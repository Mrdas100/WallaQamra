// صور شريط الأختام مولّدة مسبقاً (scripts/gen-assets.py) في public/stamps لكل عدد أكواب من 3 إلى 10

export const STAMP_STRIP_MIN = 3;
export const STAMP_STRIP_MAX = 10;

/** اسم صورة الشريط لعدد الأكواب المطلوب والرصيد الحالي، أو null إذا كان العدد خارج المدى المولّد */
export function stampStripFile(goal: number, balance: number, scale: 1 | 2 | 3): string | null {
  if (!Number.isInteger(goal) || goal < STAMP_STRIP_MIN || goal > STAMP_STRIP_MAX) return null;
  const filled = Math.max(0, Math.min(goal, balance));
  return `${goal}-${filled}@${scale}x.png`;
}
