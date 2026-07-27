import type { Metadata } from "next";
import { headers } from "next/headers";
import { INTERFACE_LOCALE_HEADER, normalizeLocale } from "@/i18n";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "Open GEO Console",
  description: "Open-source AI Search Console for company websites."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = normalizeLocale((await headers()).get(INTERFACE_LOCALE_HEADER) ?? undefined);
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <div className="min-h-screen shell-grid">
          {children}
        </div>
      </body>
    </html>
  );
}

function getMetadataBase(): URL {
  const configured = process.env.OGC_REPORT_BASE_URL?.trim();
  const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const candidate = configured || (vercelProductionHost ? `https://${vercelProductionHost}` : "http://localhost:3000");
  try {
    const url = new URL(candidate);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return new URL("http://localhost:3000");
  }
}
