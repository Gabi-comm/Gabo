import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Shell } from "@/components/shell/Shell";
import "./globals.css";
import "@/components/mascot/mascot.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Gabo",
  description: "Gab's agent office: a Claude Code harness with a team of role agents.",
};

export const viewport: Viewport = { themeColor: "#141413", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
