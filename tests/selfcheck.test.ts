import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { walletSelfCheck } from "@/modules/wallet/selfcheck";

const KEYS = [
  "APPLE_SIGNER_CERT_PEM",
  "APPLE_SIGNER_KEY_PEM",
  "APPLE_SIGNER_KEY_PASSPHRASE",
  "APPLE_WWDR_PEM",
  "GOOGLE_WALLET_ISSUER_ID",
  "GOOGLE_SA_EMAIL",
  "GOOGLE_SA_PRIVATE_KEY",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** يولّد سلسلة شهادات اختبارية: CA وشهادة Pass Type ID موقّعة منه */
function makeChain(passTypeId: string) {
  const d = mkdtempSync(join(tmpdir(), "selfcheck-"));
  const run = (...args: string[]) => execFileSync("openssl", args, { cwd: d, stdio: "pipe" });
  run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "2", "-subj", "/CN=Test WWDR");
  run("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "pass.key", "-out", "pass.csr", "-subj", `/UID=${passTypeId}/CN=Pass Type ID: ${passTypeId}`);
  run("x509", "-req", "-in", "pass.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "pass.pem", "-days", "2");
  run("genrsa", "-out", "other.key", "2048");
  const f = (n: string) => readFileSync(join(d, n), "utf8");
  return { wwdr: f("ca.pem"), cert: f("pass.pem"), key: f("pass.key"), otherKey: f("other.key"), caKey: f("ca.key") };
}

function setApple(cert: string, key: string, wwdr: string) {
  process.env.APPLE_SIGNER_CERT_PEM = Buffer.from(cert).toString("base64");
  process.env.APPLE_SIGNER_KEY_PEM = key;
  process.env.APPLE_WWDR_PEM = wwdr;
}

describe("فحص شهادات المحافظ عند الإقلاع", () => {
  const chain = makeChain(process.env.APPLE_PASS_TYPE_ID!);

  it("وضع التجربة عند غياب أي شهادة", () => {
    for (const k of KEYS) delete process.env[k];
    expect(walletSelfCheck()).toEqual({ apple: { mode: "dev" }, google: { mode: "dev" } });
  });

  it("سلسلة Apple صحيحة: live بلا مشاكل", () => {
    setApple(chain.cert, chain.key, chain.wwdr);
    expect(walletSelfCheck().apple).toEqual({ mode: "live" });
  });

  it("يكشف مفتاحاً لا يطابق الشهادة", () => {
    setApple(chain.cert, chain.otherKey, chain.wwdr);
    expect(walletSelfCheck().apple.problem).toMatch(/does not match/);
  });

  it("يكشف WWDR خاطئة", () => {
    const other = makeChain("pass.other");
    setApple(chain.cert, chain.key, other.wwdr);
    expect(walletSelfCheck().apple.problem).toMatch(/WWDR/);
  });

  it("يكشف شهادة لـ Pass Type ID آخر", () => {
    const other = makeChain("pass.other");
    setApple(other.cert, other.key, other.wwdr);
    expect(walletSelfCheck().apple.problem).toMatch(/not for/);
  });

  it("يكشف مفتاح Google تالفاً ولا يطبع قيمته", () => {
    process.env.GOOGLE_WALLET_ISSUER_ID = "1";
    process.env.GOOGLE_SA_EMAIL = "a@b.c";
    process.env.GOOGLE_SA_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nSECRETJUNK\\n-----END PRIVATE KEY-----";
    const r = walletSelfCheck().google;
    expect(r.mode).toBe("live");
    expect(r.problem).toMatch(/cannot parse/);
    expect(r.problem).not.toContain("SECRETJUNK");
    process.env.GOOGLE_SA_PRIVATE_KEY = chain.caKey;
    expect(walletSelfCheck().google).toEqual({ mode: "live" });
  });
});
