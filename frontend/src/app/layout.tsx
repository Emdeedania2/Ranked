import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = "https://ranked-neon.vercel.app";

export const metadata: Metadata = {
  title: "Based or Degen? | Base Mini App",
  description: "Discover your onchain identity - are you a Builder or a Degen?",
  manifest: "/manifest.json",
  openGraph: {
    title: "Based or Degen?",
    description: "Discover your onchain identity - are you a Builder or a Degen?",
    images: [`${appUrl}/og-image.png`],
  },
  other: {
    "base:app_id": "69615be7b8395f034ac22010",
    "fc:frame": JSON.stringify({
      version: "1",
      imageUrl: `${appUrl}/og-image.png`,
      button: {
        title: "Check Your Score",
        action: {
          type: "launch_frame",
          name: "Based or Degen?",
          url: appUrl,
          splashImageUrl: `${appUrl}/splash.png`,
          splashBackgroundColor: "#0052FF",
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
