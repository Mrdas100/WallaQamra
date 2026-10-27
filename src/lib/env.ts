// قراءة الإعدادات من متغيرات البيئة (كل الأسرار في متغيرات Railway فقط).

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) ? v : fallback;
}

const isProd = process.env.NODE_ENV === "production";

function secret(name: string): string {
  const v = str(name);
  if (v) return v;
  if (isProd && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`Missing required secret ${name}`);
  }
  // قيمة تطوير ثابتة فقط خارج الإنتاج
  return `dev-insecure-${name}`;
}

export const env = {
  get isProd() {
    return isProd;
  },
  get appUrl() {
    return str("APP_URL", "http://localhost:3000").replace(/\/$/, "");
  },
  get businessSlug() {
    return str("BUSINESS_SLUG", "shahi-qamra");
  },
  get businessName() {
    return str("BUSINESS_NAME", "شاهي قمرا");
  },
  get qrSecret() {
    return secret("QR_SIGNING_SECRET");
  },
  get cronSecret() {
    return secret("CRON_SECRET");
  },
  get hashSalt() {
    return secret("HASH_SALT");
  },
  get qrPassTtlHours() {
    return int("QR_PASS_TTL_HOURS", 48);
  },
  get qrLiveTtlSeconds() {
    return int("QR_LIVE_TTL_SECONDS", 90);
  },
  get sessionHours() {
    return int("SESSION_HOURS", 12);
  },
  get apiRateLimitPerMinute() {
    return int("API_RATE_LIMIT_PER_MINUTE", 240);
  },
  apple: {
    get passTypeId() {
      return str("APPLE_PASS_TYPE_ID", "pass.com.example.shahiqamra");
    },
    get teamId() {
      return str("APPLE_TEAM_ID", "DEVTEAMID0");
    },
    get signerCertPem() {
      return decodePem(str("APPLE_SIGNER_CERT_PEM"));
    },
    get signerKeyPem() {
      return decodePem(str("APPLE_SIGNER_KEY_PEM"));
    },
    get signerKeyPassphrase() {
      return str("APPLE_SIGNER_KEY_PASSPHRASE");
    },
    get wwdrPem() {
      return decodePem(str("APPLE_WWDR_PEM"));
    },
    get apnsHost() {
      return str("APPLE_APNS_HOST", "api.push.apple.com");
    },
    /** وضع التطوير: لا توجد شهادات، فلا توقيع ولا push حقيقي */
    get devMode() {
      return !(this.signerCertPem && this.signerKeyPem && this.wwdrPem);
    },
  },
  google: {
    get issuerId() {
      return str("GOOGLE_WALLET_ISSUER_ID");
    },
    get classSuffix() {
      return str("GOOGLE_WALLET_CLASS_SUFFIX", "shahi_qamra_loyalty");
    },
    get serviceAccountEmail() {
      return str("GOOGLE_SA_EMAIL");
    },
    get serviceAccountKeyPem() {
      return decodePem(str("GOOGLE_SA_PRIVATE_KEY"));
    },
    get devMode() {
      return !(this.issuerId && this.serviceAccountEmail && this.serviceAccountKeyPem);
    },
  },
};

/** يقبل PEM نصياً (مع \n) أو مرمّزاً بـ base64 لسهولة وضعه في متغيرات Railway */
export function decodePem(value: string): string {
  if (!value) return "";
  if (value.includes("-----BEGIN")) return value.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    return decoded.includes("-----BEGIN") ? decoded : "";
  } catch {
    return "";
  }
}
