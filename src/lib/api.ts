import type { Role } from "@prisma/client";
import { ZodError, type z } from "zod";
import { env } from "./env";
import { AppError } from "./errors";
import { enforceRateLimit } from "./ratelimit";
import { requestMeta, sameOrigin, type RequestMeta } from "./request";
import { actorFor, requireRole, staffFromRequest, type AuthedStaff } from "@/modules/auth";
import type { Actor } from "@/modules/actor";

// غلاف موحّد لكل الـ API: rate limiting + صلاحيات في السيرفر + CSRF + أخطاء عربية + no-store.

export const NO_STORE = { "cache-control": "no-store, max-age=0" };

export interface ApiContext<P> {
  req: Request;
  meta: RequestMeta;
  params: P;
  staff: AuthedStaff | null;
  /** متاح فقط عند تحديد role */
  actor: Actor;
}

export interface ApiOptions {
  /** اسم يُستخدم في مفتاح rate limit */
  name: string;
  role?: Role;
  /** حد إضافي خاص بالمسار */
  rate?: { limit: number; windowSec: number; by?: "ip" | "staff" };
  /** تعطيل فحص الأصل (لمسارات Apple Wallet التي لا تأتي من متصفح) */
  skipOriginCheck?: boolean;
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    const headers: Record<string, string> = { ...NO_STORE };
    if (e.status === 429 && typeof e.extra?.retryAfter === "number") headers["retry-after"] = String(e.extra.retryAfter);
    return Response.json({ ok: false, error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status, headers });
  }
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    const msg = issue?.code === "unrecognized_keys" ? `حقل غير مسموح: ${issue.keys.join(", ")}` : "بيانات غير صالحة";
    return Response.json(
      { ok: false, error: { code: "BAD_REQUEST", message: msg, path: issue?.path?.join(".") } },
      { status: 400, headers: NO_STORE },
    );
  }
  const prismaCode = (e as { code?: string })?.code;
  if (prismaCode === "P2002") {
    return Response.json({ ok: false, error: { code: "CONFLICT", message: "عملية مكررة" } }, { status: 409, headers: NO_STORE });
  }
  console.error("[api] unhandled", e);
  return Response.json({ ok: false, error: { code: "INTERNAL", message: "خطأ غير متوقع" } }, { status: 500, headers: NO_STORE });
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function route<P = Record<string, string>>(
  opts: ApiOptions,
  fn: (ctx: ApiContext<P>) => Promise<unknown>,
) {
  return async (req: Request, routeCtx?: { params: Promise<P> }): Promise<Response> => {
    try {
      const meta = requestMeta(req);
      await enforceRateLimit(`api:${meta.ip}`, env.apiRateLimitPerMinute, 60);

      let staff: AuthedStaff | null = null;
      if (opts.role) {
        staff = requireRole(await staffFromRequest(req), opts.role);
        if (MUTATING.has(req.method) && !opts.skipOriginCheck && !sameOrigin(req)) {
          throw new AppError("FORBIDDEN", "طلب من مصدر غير موثوق");
        }
      }
      if (opts.rate) {
        const who = opts.rate.by === "staff" && staff ? `s:${staff.id}` : `ip:${meta.ip}`;
        await enforceRateLimit(`${opts.name}:${who}`, opts.rate.limit, opts.rate.windowSec);
      }
      const params = (routeCtx ? await routeCtx.params : {}) as P;
      const actor = staff ? actorFor(staff, meta) : (null as unknown as Actor);
      const result = await fn({ req, meta, params, staff, actor });
      if (result instanceof Response) return result;
      return Response.json({ ok: true, data: result ?? null }, { headers: NO_STORE });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("BAD_REQUEST", "صيغة الطلب غير صحيحة");
  }
  return schema.parse(body);
}

/** "12.50" → 1250 هللة (بدون أخطاء الفاصلة العائمة) */
export function parseAmountToHalalas(input: string | number): number {
  const s = String(input)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace("٫", ".");
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new AppError("BAD_REQUEST", "المبلغ غير صالح");
  const halalas = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (halalas <= 0) throw new AppError("BAD_REQUEST", "المبلغ غير صالح");
  return halalas;
}
