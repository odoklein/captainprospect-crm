import type { MetadataRoute } from "next";
import { site } from "@/content/site";
import { sectors } from "@/content/pages/secteurs";
import { guides } from "@/content/pages/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" = "monthly") => ({
    url: `${site.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  });
  return [
    page("/", 1, "weekly"),
    page("/prospection-externalisee", 0.9, "weekly"),
    page("/crm-agence-prospection", 0.9, "weekly"),
    page("/tarifs", 0.9),
    page("/secteurs", 0.6),
    ...sectors.map((s) => page(s.path, 0.7)),
    page("/guides", 0.6, "weekly"),
    ...guides.map((g) => page(g.path, 0.7)),
    page("/a-propos", 0.5),
    page("/demo", 0.6),
  ];
}
