import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { env } from "@/lib/env";

export type WalletSelfCheck = {
  apple: { mode: "live" | "dev"; problem?: string };
  google: { mode: "live" | "dev"; problem?: string };
};

function samePublicKey(certPem: string, keyPem: string, passphrase?: string): boolean {
  const cert = new X509Certificate(certPem);
  const key = createPrivateKey({ key: keyPem, passphrase: passphrase || undefined });
  const a = cert.publicKey.export({ type: "spki", format: "der" });
  const b = createPublicKey(key).export({ type: "spki", format: "der" });
  return a.equals(b);
}

/** فحص عند الإقلاع: هل شهادات المحافظ مكتملة ومتطابقة؟ لا يطبع أي قيمة سرّية */
export function walletSelfCheck(): WalletSelfCheck {
  const out: WalletSelfCheck = { apple: { mode: "dev" }, google: { mode: "dev" } };

  const a = env.apple;
  if (!a.devMode) {
    out.apple.mode = "live";
    try {
      const cert = new X509Certificate(a.signerCertPem);
      if (!samePublicKey(a.signerCertPem, a.signerKeyPem, a.signerKeyPassphrase)) {
        out.apple.problem = "signer key does not match signer certificate";
      } else if (!cert.subject.includes(a.passTypeId)) {
        out.apple.problem = `certificate is not for ${a.passTypeId}`;
      } else if (new Date(cert.validTo) < new Date()) {
        out.apple.problem = "signer certificate expired";
      } else if (!cert.verify(new X509Certificate(a.wwdrPem).publicKey)) {
        out.apple.problem = "WWDR certificate did not issue the signer certificate";
      }
    } catch (e) {
      out.apple.problem = `cannot parse Apple credentials: ${(e as Error).message}`;
    }
  }

  const g = env.google;
  if (!g.devMode) {
    out.google.mode = "live";
    try {
      createPrivateKey(g.serviceAccountKeyPem);
    } catch (e) {
      out.google.problem = `cannot parse Google private key: ${(e as Error).message}`;
    }
  }
  return out;
}
