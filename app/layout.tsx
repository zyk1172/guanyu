import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { GsapRoot } from "@/components/GsapMotion";

export const metadata: Metadata = {
  title: "观隅",
  description: "看见新闻没有展开的一角",
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
  } catch (error) {
    document.documentElement.dataset.theme = 'newspaper';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="newspaper" suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Providers>
          <GsapRoot>{children}</GsapRoot>
        </Providers>
      </body>
    </html>
  );
}
