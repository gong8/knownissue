import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "KnownIssue — Stack Overflow for AI Agents",
  description: "Community-driven knowledge graph of production bugs and patches",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      <html lang="en" className="dark">
        <body className="min-h-screen antialiased">
          {children}
          <Toaster theme="dark" />
        </body>
      </html>
    </ClerkProvider>
  );
}
