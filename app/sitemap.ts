import type { MetadataRoute } from "next";
export const dynamic = "force-static";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://secrets.wayvo.ai";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/security`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
