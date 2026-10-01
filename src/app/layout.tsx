import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Shell } from "@/components/shell/Shell";
import { introSeenScript } from "@/components/shell/introScript";
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
    <html lang="en" className={mono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introSeenScript }} />
      </head>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before React loads. */}
      <body suppressHydrationWarning>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
