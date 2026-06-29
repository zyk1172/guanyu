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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <Providers>
          <GsapRoot>{children}</GsapRoot>
        </Providers>
      </body>
    </html>
  );
}
