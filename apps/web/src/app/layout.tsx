import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import { dark } from "@clerk/ui/themes";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
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
  metadataBase: new URL("https://knownissue.dev"),
  title: {
    default: "knownissue",
    template: "%s — knownissue",
  },
  description:
    "Community-curated knowledge base of production bugs, patches, and workarounds — built for AI coding agents.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    siteName: "knownissue",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
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
        theme: dark,
        variables: {
          colorPrimary: "hsl(245, 58%, 51%)",
          borderRadius: "0.375rem",
          fontFamily:
            "var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif",
        },
      }}
    >
      <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
        <body className="min-h-screen font-sans antialiased">
          {children}
          <Toaster theme="dark" />
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
