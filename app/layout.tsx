import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import Providers from "@/components/providers/Providers";
import { Analytics } from "@vercel/analytics/next";
import { getBrand } from "@/lib/brand/server";
import { BrandProvider } from "@/lib/brand/client";
import { brandFontVariables } from "@/brand/fonts";
import { BrandStyle } from "@/components/brand/BrandStyle";
import { RuntimeConfigScript } from "@/components/runtime/RuntimeConfigScript";
import { getPublicRuntimeConfig } from "@/lib/runtime-config/server";

// The brand is this instance's BrandSettings row (cached 60 s in lib/brand/server),
// so every page renders per request: no build-time snapshot of the default brand.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const brand = await getBrand();
  return {
    title: {
      default: brand.productName,
      template: `%s | ${brand.name}`,
    },
    description: `${brand.tagline} — ${brand.productName}`,
    applicationName: brand.productName,
    icons: {
      icon: [
        { url: brand.logos.favicon, type: brand.logos.favicon.startsWith("/api/") ? undefined : "image/png" },
        { url: "/favicon.ico", sizes: "any" },
      ],
      apple: brand.logos.appleTouchIcon,
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  await connection();
  const brand = await getBrand();
  return { themeColor: brand.palette.primarySeed };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const brand = await getBrand();
  const runtimeConfig = getPublicRuntimeConfig(brand.appUrl);
  return (
    <html lang={brand.locale.lang} className={brandFontVariables} suppressHydrationWarning>
      <head>
        <BrandStyle brand={brand} />
        <RuntimeConfigScript config={runtimeConfig} />
      </head>
      <body className="antialiased bg-canvas text-ink" suppressHydrationWarning>
        <BrandProvider brand={brand}>
          <Providers>{children}</Providers>
        </BrandProvider>
        {process.env.VERCEL === "1" && <Analytics />}
      </body>
    </html>
  );
}
