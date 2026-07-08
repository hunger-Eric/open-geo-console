import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open GEO Console",
  description: "Open-source AI Search Console for company websites."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen shell-grid">
          {children}
        </div>
      </body>
    </html>
  );
}
