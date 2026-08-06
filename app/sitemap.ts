import type { MetadataRoute } from "next";
import { tournaments } from "@/data/tournaments";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const routes: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/vytvorit-turnaj`, changeFrequency: "monthly", priority: 0.7 },
  ];
  return routes.concat(
    tournaments.map((tournament) => ({
      url: `${baseUrl}/turnaje/${tournament.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  );
}
