import type { Metadata } from "next";
import { Barlow_Condensed, Public_Sans } from "next/font/google";
import "./globals.css";

// Barlow Condensed descends from US highway/transport signage: airport codes and the verdict.
// Public Sans is the US Web Design System face — the same register as the FAA and NWS feeds.
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trip disruption check",
  description: "One view of what could disrupt a U.S. flight, the evidence behind it, and what Ops should do.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
