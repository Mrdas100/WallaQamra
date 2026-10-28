export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE_ORDER"
  | "RATE_LIMITED"
  | "DAILY_CAP"
  | "COOLDOWN"
  | "LOCKED"
  | "SCAN_REQUIRED"
  | "INSUFFICIENT_BALANCE"
  | "SHIFT_LIMIT"
  | "QR_EXPIRED"
  | "QR_INVALID"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE_ORDER: 409,
  RATE_LIMITED: 429,
  DAILY_CAP: 422,
  COOLDOWN: 429,
  LOCKED: 423,
  SCAN_REQUIRED: 422,
  INSUFFICIENT_BALANCE: 422,
  SHIFT_LIMIT: 422,
  QR_EXPIRED: 422,
  QR_INVALID: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const fail = (code: ErrorCode, message: string, extra?: Record<string, unknown>): never => {
  throw new AppError(code, message, extra);
};
