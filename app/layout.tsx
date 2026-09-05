import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Tournio — športové turnaje", template: "%s | Tournio" },
  description: "Objav športové turnaje na Slovensku a v Česku.",
  openGraph: {
    title: "Tournio — športové turnaje",
    description: "Objav športové turnaje na Slovensku a v Česku.",
    url: siteUrl,
    siteName: "Tournio",
    locale: "sk_SK",
    type: "website",
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="sk"><body><Header/><main>{children}</main><Footer/></body></html>; }
