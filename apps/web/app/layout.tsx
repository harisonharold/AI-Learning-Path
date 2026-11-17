import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted, SIL OFL 1.1 (app/fonts/README.md). No request leaves the app for fonts.
const sans = localFont({ variable: "--font-inter", display: "swap", src: [
  { path: "./fonts/inter-latin-400-normal.woff2", weight: "400" }, { path: "./fonts/inter-latin-500-normal.woff2", weight: "500" }, { path: "./fonts/inter-latin-600-normal.woff2", weight: "600" }] });
const serif = localFont({ variable: "--font-source-serif", display: "swap", src: [
  { path: "./fonts/source-serif-4-latin-400-normal.woff2", weight: "400" }, { path: "./fonts/source-serif-4-latin-600-normal.woff2", weight: "600" }] });
const mono = localFont({ variable: "--font-jetbrains", display: "swap", src: [{ path: "./fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400" }] });

export const metadata: Metadata = { title: { default: "Systems Atlas", template: "%s · Systems Atlas" }, description: "Competence-gated learning, research and open-source evidence." };

// Applies the saved theme before first paint. Nonce comes from proxy.ts (CSP).
const THEME_SCRIPT = `try{var t=localStorage.getItem('atlas-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
