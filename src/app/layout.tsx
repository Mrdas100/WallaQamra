import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
// خطوط عربية مرخّصة (SIL OFL) تُخدم من نفس الموقع، فلا نحتاج اتصالاً خارجياً ولا تغيير CSP
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/tajawal/800.css";
import "@fontsource/reem-kufi/500.css";
import "@fontsource/reem-kufi/700.css";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
// خط بنغالي لشاشة الكاشير (يُحمَّل فقط عند ظهور حروف بنغالية بفضل unicode-range)
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/600.css";
import "@fontsource/noto-sans-bengali/700.css";
import "./globals.css";
import "./card.css";

export const metadata: Metadata = {
  title: "شاهي قمرا — بطاقة الولاء",
  description: "اجمع النقاط مع كل طلب في شاهي قمرا",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5c1a28",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // قراءة الهيدر تجعل كل الصفحات ديناميكية لكي يُطبَّق nonce الخاص بـ CSP على سكربتات Next
  await headers();
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
