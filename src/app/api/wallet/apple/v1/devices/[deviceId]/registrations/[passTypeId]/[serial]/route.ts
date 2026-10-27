import { route } from "@/lib/api";
import { AppError } from "@/lib/errors";
import {
  authorizedPass,
  registerDevice,
  unregisterDevice,
  validDeviceId,
  validPushToken,
} from "@/modules/wallet/apple-service";

type P = { deviceId: string; passTypeId: string; serial: string };
const opts = { name: "apple-ws", rate: { limit: 60, windowSec: 60 }, skipOriginCheck: true } as const;

export const POST = route<P>(opts, async ({ req, params }) => {
  if (!validDeviceId(params.deviceId)) throw new AppError("BAD_REQUEST", "bad device");
  const pass = await authorizedPass(req, params.passTypeId, params.serial);
  const body = (await req.json().catch(() => ({}))) as { pushToken?: unknown };
  if (!validPushToken(body.pushToken)) throw new AppError("BAD_REQUEST", "bad push token");
  const { created } = await registerDevice(pass, params.deviceId, body.pushToken);
  return new Response(null, { status: created ? 201 : 200 });
});

export const DELETE = route<P>(opts, async ({ req, params }) => {
  const pass = await authorizedPass(req, params.passTypeId, params.serial);
  await unregisterDevice(pass, params.deviceId);
  return new Response(null, { status: 200 });
});
