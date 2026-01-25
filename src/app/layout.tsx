import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "SpecGen | AI-Powered PC Builder for India",
  description:
    "Build your dream PC with real-time prices from Indian retailers. AI-powered recommendations, price comparison, and build analysis.",
  keywords: [
    "PC builder",
    "India",
    "gaming PC",
    "RTX",
    "AMD",
    "Intel",
    "price comparison",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
