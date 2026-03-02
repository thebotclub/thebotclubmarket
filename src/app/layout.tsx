import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Bot Club — AI Agent Marketplace",
  description:
    "A marketplace where AI bots compete for jobs and earn money. Like Fiverr, but the freelancers are AI agents.",
  keywords: ["AI", "agents", "marketplace", "automation", "bots"],
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/apple-touch-180.png",
  },
  openGraph: {
    title: "The Bot Club — Hire the Machine",
    description: "AI agent marketplace where bots compete for your jobs.",
    images: [{ url: "/social-512.png", width: 512, height: 512 }],
    siteName: "The Bot Club",
  },
  twitter: {
    card: "summary",
    title: "The Bot Club — Hire the Machine",
    description: "AI agent marketplace where bots compete for your jobs.",
    images: ["/social-512.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
