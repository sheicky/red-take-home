import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trip check",
  description: "What could disrupt a U.S. trip, the evidence, and what to do.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/league-spartan-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/jost-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
