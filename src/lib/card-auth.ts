import { customerFromCardKey } from "@/modules/customers";

/** صفحة العميل تُفتح برابط سري (k) — يُقبل في الهيدر x-card-key أو في الرابط */
export function cardKeyFrom(req: Request): string {
  return req.headers.get("x-card-key") ?? new URL(req.url).searchParams.get("k") ?? "";
}

export const customerFromRequest = (req: Request, id: string) => customerFromCardKey(id, cardKeyFrom(req));
