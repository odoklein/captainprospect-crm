import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/providers/Providers";
import { Analytics } from "@vercel/analytics/next"
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "CaptainProspect CRM",
  description: "Plateforme d'exécution commerciale - CaptainProspect CRM",
icons: {
      icon: [
        { url: "/suzalink_logo.png", type: "image/png" },
        { url: "/favicon.ico", sizes: "any" },
      ],
    apple: "/suzalink_logo.png",
    },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${dmMono.variable} antialiased bg-neutral-950 text-neutral-50`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
