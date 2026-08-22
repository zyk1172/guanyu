import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import Providers from "@/components/Providers";
import { GsapRoot } from "@/components/GsapMotion";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.guanyu.dynv6.net";
const siteName = "观隅 Guanyu";
const siteDescription = "观隅（Guanyu）是面向新闻阅读者的叙事审视工具：帮助区分事实、主张、证据与待核验信息，看见新闻没有展开的一角。";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "观隅 Guanyu | 新闻叙事审视与证据核验工具",
    template: "%s | 观隅 Guanyu",
  },
  description: siteDescription,
  applicationName: siteName,
  category: "News",
  keywords: [
    "观隅",
    "Guanyu",
    "新闻叙事审视",
    "新闻分析",
    "新闻核验",
    "证据核验",
    "媒体素养",
    "新闻阅读",
  ],
  alternates: {
    canonical: "/",
  },
  authors: [{ name: "观隅 Guanyu" }],
  creator: "观隅 Guanyu",
  publisher: "观隅 Guanyu",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "/",
    siteName,
    title: "观隅 Guanyu | 新闻叙事审视与证据核验工具",
    description: siteDescription,
    images: [{ url: "/guanyu-icon.png", width: 1200, height: 1200, alt: "观隅 Guanyu" }],
  },
  twitter: {
    card: "summary",
    title: "观隅 Guanyu | 新闻叙事审视与证据核验工具",
    description: siteDescription,
    images: ["/guanyu-icon.png"],
  },
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}),
  },
  icons: {
    icon: "/guanyu-icon.png",
    shortcut: "/guanyu-icon.png",
    apple: "/guanyu-icon.png",
  },
};

const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('guanyu-theme') || 'newspaper';
    if (!/^(newspaper|night|kids)$/.test(theme)) theme = 'newspaper';
    document.documentElement.dataset.theme = theme;
    var language = localStorage.getItem('guanyu-ui-language') || 'zh-CN';
    if (!/^(zh-CN|zh-TW|en-US|ja-JP|ko-KR|de-DE|it-IT)$/.test(language)) language = 'zh-CN';
    document.documentElement.dataset.uiLanguage = language;
    document.documentElement.lang = language;
  } catch (error) {
    document.documentElement.dataset.theme = 'newspaper';
    document.documentElement.dataset.uiLanguage = 'zh-CN';
    document.documentElement.lang = 'zh-CN';
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') || undefined;
  return (
    <html lang="zh-CN" data-theme="newspaper" data-ui-language="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: siteName,
              alternateName: ["观隅", "Guanyu"],
              url: siteUrl,
              image: `${siteUrl}/guanyu-icon.png`,
              description: siteDescription,
              applicationCategory: "NewsApplication",
              operatingSystem: "Web",
              inLanguage: ["zh-CN", "en-US"],
              publisher: {
                "@type": "Organization",
                name: siteName,
                url: siteUrl,
              },
            }).replace(/</g, "\\u003c"),
          }}
        />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Providers>
          <GsapRoot>{children}</GsapRoot>
        </Providers>
      </body>
    </html>
  );
}
