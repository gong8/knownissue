import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ui } from "@clerk/ui";
import { Toaster } from "sonner";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "[knownissue] — stop hallucinating fixes",
  description:
    "Community-curated knowledge base of production bugs, patches, and workarounds — built for AI coding agents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      ui={ui}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "hsl(245, 58%, 51%)",
          colorBackground: "hsl(0, 0%, 7%)",
          colorForeground: "hsl(0, 0%, 93%)",
          colorNeutral: "hsl(0, 0%, 93%)",
          colorMutedForeground: "hsl(0, 0%, 70%)",
          colorInput: "hsl(0, 0%, 9%)",
          colorInputForeground: "hsl(0, 0%, 93%)",
          colorBorder: "hsl(0, 0%, 15%)",
          colorDanger: "hsl(0, 62%, 50%)",
          borderRadius: "0.375rem",
          fontFamily:
            "var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif",
          fontSize: "14px",
        },
      }}
    >
      <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
        <body className="min-h-screen font-sans antialiased">
          {children}
          <Toaster theme="dark" />
        </body>
      </html>
    </ClerkProvider>
  );
}
