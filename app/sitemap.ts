import type { MetadataRoute } from "next";
import { HTML_LANG, LANGS, langPath, sourcesPath } from "./lib/i18n";
import { SITE_URL } from "./lib/site";

// 언어별 페이지(대시보드·출처 페이지)와 hreflang 대체 주소를 검색엔진에 알린다.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LANGS.map((l) => [HTML_LANG[l], `${SITE_URL}${langPath(l)}`]));
  const sourcesLanguages = Object.fromEntries(LANGS.map((l) => [HTML_LANG[l], `${SITE_URL}${sourcesPath(l)}`]));
  return [
    ...LANGS.map((l) => ({
      url: `${SITE_URL}${langPath(l)}`,
      changeFrequency: "weekly" as const,
      priority: l === "ko" || l === "en" ? 1 : 0.8,
      alternates: { languages },
    })),
    ...LANGS.map((l) => ({
      url: `${SITE_URL}${sourcesPath(l)}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
      alternates: { languages: sourcesLanguages },
    })),
  ];
}
