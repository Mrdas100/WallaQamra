"use client";

import { useCallback, useEffect, useState } from "react";
import type { Design } from "@/modules/design/config";
import { api } from "@/ui/api";
import LoyaltyCard, { type CardData } from "@/ui/card/loyalty-card";

// بطاقة العميل الحية: QR يتجدد تلقائياً، والأختام الجديدة منذ آخر زيارة تمتلئ بحركة.

export default function CardLive({ id, cardKey, design, data, nonce }: { id: string; cardKey: string; design: Design; data: CardData; nonce: string }) {
  const [qr, setQr] = useState("");
  const [from, setFrom] = useState(data.balance);

  const loadQr = useCallback(async () => {
    try {
      const r = await api<{ svg: string; refreshInSeconds: number }>(`/api/card/${id}/qr`, { headers: { "x-card-key": cardKey } });
      setQr(r.svg);
      return r.refreshInSeconds;
    } catch {
      return 30;
    }
  }, [id, cardKey]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const tick = async () => {
      const next = await loadQr();
      if (alive) timer = setTimeout(tick, next * 1000);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [loadQr]);

  // آخر رصيد شاهده العميل محفوظ في جهازه فقط (للحركة، لا يؤثر على الرصيد الحقيقي)
  useEffect(() => {
    const key = `qc:seen:${id}`;
    let seen: number | null = null;
    try {
      const raw = localStorage.getItem(key);
      seen = raw === null ? null : Number(raw);
      localStorage.setItem(key, String(data.balance));
    } catch {
      /* التخزين غير متاح (وضع خاص): نعرض البطاقة بدون حركة */
    }
    if (seen === null || !Number.isFinite(seen) || seen >= data.balance) return;
    const start = Math.max(0, seen);
    const raf = requestAnimationFrame(() => setFrom(start));
    return () => cancelAnimationFrame(raf);
  }, [id, data.balance]);

  return (
    <LoyaltyCard
      design={design}
      data={data}
      nonce={nonce}
      animateFrom={from}
      qr={qr ? <span dangerouslySetInnerHTML={{ __html: qr }} /> : null}
    />
  );
}
