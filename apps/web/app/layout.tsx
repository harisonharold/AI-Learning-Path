import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Systems Atlas", template: "%s · Systems Atlas" }, description: "Competence-gated learning, research and open-source evidence." };

// Applies the saved theme before first paint. Nonce comes from proxy.ts (CSP).
const THEME_SCRIPT = `try{var t=localStorage.getItem('atlas-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
