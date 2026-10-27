// أدوات الوقت حسب منطقة المحل (افتراضياً Asia/Riyadh) بدون مكتبات خارجية.

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = الأحد
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

export const minuteOfDay = (date: Date, tz: string): number => {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
};

/** فرق المنطقة عن UTC بالدقائق في لحظة معينة */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/** بداية اليوم المحلي (منتصف الليل في منطقة المحل) كلحظة UTC */
export function startOfLocalDay(date: Date, tz: string): Date {
  const p = zonedParts(date, tz);
  const offset = tzOffsetMinutes(date, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offset * 60000);
}

/** هل الدقيقة داخل نافذة [start, end) مع دعم النوافذ التي تعبر منتصف الليل */
export function inWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** أقرب لحظة قادمة تكون فيها الساعة المحلية = minute */
export function nextLocalMinute(from: Date, minute: number, tz: string): Date {
  const dayStart = startOfLocalDay(from, tz);
  let candidate = new Date(dayStart.getTime() + minute * 60000);
  if (candidate.getTime() <= from.getTime()) candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
  return candidate;
}

export const localDateKey = (date: Date, tz: string): string => {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

export const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
export const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600000);
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
