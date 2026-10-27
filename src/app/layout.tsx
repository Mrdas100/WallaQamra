import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

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
