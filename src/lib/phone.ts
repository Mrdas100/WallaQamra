// أرقام الجوال السعودية: تُخزَّن بصيغة E.164 (+9665XXXXXXXX)

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

export function toLatinDigits(input: string): string {
  return input.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function normalizePhone(input: string): string | null {
  const digits = toLatinDigits(input).replace(/[^\d+]/g, "");
  let local: string | null = null;
  if (/^\+9665\d{8}$/.test(digits)) local = digits.slice(4);
  else if (/^009665\d{8}$/.test(digits)) local = digits.slice(5);
  else if (/^9665\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^05\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^5\d{8}$/.test(digits)) local = digits;
  return local ? `+966${local}` : null;
}

/** يعرض للكاشير آخر رقمين فقط: 05•••••• 34 */
export function maskPhone(e164: string): string {
  const last2 = e164.slice(-2);
  return `05••••••${last2}`;
}
