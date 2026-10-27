"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** طلب JSON إلى الـ API مع رسائل خطأ عربية */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "same-origin",
    cache: "no-store",
  });
  let json: { ok?: boolean; data?: T; error?: { code: string; message: string } } = {};
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok || json.ok === false) {
    const err = json.error ?? { code: "INTERNAL", message: "تعذر الاتصال، حاول مجدداً" };
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login")) {
      window.location.href = "/login";
    }
    const { code, message, ...extra } = err as { code: string; message: string } & Record<string, unknown>;
    throw new ApiError(message, code, extra);
  }
  return json.data as T;
}

export const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
