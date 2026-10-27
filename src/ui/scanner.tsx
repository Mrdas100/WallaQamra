"use client";

import { useEffect, useRef, useState } from "react";
import type { CashierText } from "@/ui/i18n/cashier";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * ماسح QR خفيف: يستخدم BarcodeDetector المدمج في المتصفح إن وُجد، وإلا jsQR (يُحمَّل عند الحاجة فقط).
 * يدعم أيضاً أجهزة المسح USB/Bluetooth التي تكتب النص في الحقل.
 */
export default function Scanner({ onResult, t }: { onResult: (text: string) => void; t: CashierText }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
        const detector = BD ? new BD({ formats: ["qr_code"] }) : null;
        const jsQR = detector ? null : (await import("jsqr")).default;
        const loop = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            let text: string | null = null;
            if (detector) {
              const codes = await detector.detect(video).catch(() => []);
              text = codes[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height)?.data ?? null;
            }
            if (text) {
              setActive(false);
              onResult(text);
              return;
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setError(true);
        setActive(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, onResult]);

  return (
    <div className="stack">
      {active ? (
        <>
          <video ref={videoRef} className="video" playsInline muted />
          <button className="btn-ghost btn-block" onClick={() => setActive(false)}>{t.stopCamera}</button>
        </>
      ) : (
        <button className="btn-gold btn-block" onClick={() => { setError(false); setActive(true); }}>
          {t.scanCamera}
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onResult(manual.trim());
          setManual("");
        }}
      >
        <label htmlFor="scan">{t.scannerDevice}</label>
        <input id="scan" className="ltr" autoComplete="off" value={manual} onChange={(e) => setManual(e.target.value)} />
      </form>
      {error && <div className="alert alert-warn">{t.cameraError}</div>}
    </div>
  );
}
