// 사이트 주소와 언어별 메타데이터. 전용 도메인을 붙이면 Vercel 환경변수
// NEXT_PUBLIC_SITE_URL(예: https://kstudata.com)만 바꾸면 OG·hreflang·sitemap이 따라간다.
import type { Metadata } from "next";
import { DICTS, HTML_LANG, LANGS, OG_LOCALE, langPath, type Lang } from "./i18n";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://kstu-ten.vercel.app").replace(/\/$/, "");

export function buildMetadata(lang: Lang): Metadata {
  const t = DICTS[lang];
  const languages: Record<string, string> = Object.fromEntries(LANGS.map((l) => [HTML_LANG[l], langPath(l)]));
  languages["x-default"] = "/en";
  return {
    metadataBase: new URL(SITE_URL),
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: { canonical: langPath(lang), languages },
    openGraph: {
      type: "website",
      url: langPath(lang),
      siteName: t.brandName,
      title: t.metaTitle,
      description: t.metaDescription,
      locale: OG_LOCALE[lang],
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: t.metaTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: t.metaTitle,
      description: t.metaDescription,
      images: ["/og-image.png"],
    },
  };
}
