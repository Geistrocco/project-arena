import { getSiteAccess } from "@/lib/site-access";
import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { TrainingNotifications } from "@/components/training-notifications";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const baseMetadata: Metadata = {
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
export async function generateMetadata(): Promise<Metadata> {
  const access=await getSiteAccess();
  return {...baseMetadata,robots:access.restricted?{index:false,follow:false}:undefined};
}
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const access=await getSiteAccess();
  return <html lang="sk"><body>{access.allowed&&<Header/>}<main>{children}</main>{access.allowed&&<><Footer/><TrainingNotifications/></>}</body></html>;
}
