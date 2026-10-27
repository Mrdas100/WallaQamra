"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * ماسح QR خفيف: يستخدم BarcodeDetector المدمج في المتصفح إن وُجد، وإلا jsQR (يُحمَّل عند الحاجة فقط).
 * يدعم أيضاً أجهزة المسح USB/Bluetooth التي تكتب النص في الحقل.
 */
export default function Scanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
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
        setError("تعذر تشغيل الكاميرا. استخدم البحث بالجوال أو جهاز المسح.");
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
          <button className="btn-ghost btn-block" onClick={() => setActive(false)}>إيقاف الكاميرا</button>
        </>
      ) : (
        <button className="btn-gold btn-block" onClick={() => { setError(""); setActive(true); }}>
          مسح QR البطاقة بالكاميرا
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onResult(manual.trim());
          setManual("");
        }}
      >
        <label htmlFor="scan">أو جهاز المسح (يكتب الرمز هنا)</label>
        <input id="scan" className="ltr" autoComplete="off" value={manual} onChange={(e) => setManual(e.target.value)} />
      </form>
      {error && <div className="alert alert-warn">{error}</div>}
    </div>
  );
}
