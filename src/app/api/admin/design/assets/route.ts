import { route } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { listAssets, MAX_ASSET_BYTES, uploadAsset } from "@/modules/design/service";

export const GET = route({ name: "admin", role: "ADMIN" }, async ({ actor }) => listAssets(actor.businessId));

export const POST = route({ name: "design-upload", role: "ADMIN", rate: { limit: 30, windowSec: 600, by: "staff" } }, async ({ req, actor }) => {
  // نرفض الملفات الكبيرة قبل قراءتها
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_ASSET_BYTES + 64 * 1024) throw new AppError("BAD_REQUEST", "حجم الصورة أكبر من 1.5 ميجابايت");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("BAD_REQUEST", "صيغة الطلب غير صحيحة");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new AppError("BAD_REQUEST", "اختر صورة");
  if (file.size > MAX_ASSET_BYTES) throw new AppError("BAD_REQUEST", "حجم الصورة أكبر من 1.5 ميجابايت");
  return uploadAsset(actor, String(form.get("kind") ?? ""), Buffer.from(await file.arrayBuffer()));
});
