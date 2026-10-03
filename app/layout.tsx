import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/providers/Providers";
import { Analytics } from "@vercel/analytics/next";
import { brand } from "@/lib/brand";
import { brandFontVariables } from "@/brand/fonts";
import { BrandStyle } from "@/components/brand/BrandStyle";

export const metadata: Metadata = {
  title: {
    default: brand.productName,
    template: `%s | ${brand.name}`,
  },
  description: `${brand.tagline} — ${brand.productName}`,
  applicationName: brand.productName,
  icons: {
    icon: [
      { url: brand.logos.favicon, type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: brand.palette.primarySeed,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={brand.locale.lang} className={brandFontVariables} suppressHydrationWarning>
      <head>
        <BrandStyle />
      </head>
      <body className="antialiased bg-canvas text-ink" suppressHydrationWarning>
        <Providers>{children}</Providers>
        {process.env.VERCEL === "1" && <Analytics />}
      </body>
    </html>
  );
}
