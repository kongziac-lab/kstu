import { notFound } from "next/navigation";
import SourcesPage from "../../components/SourcesPage";
import { FOREIGN_LANGS, isLang } from "../../lib/i18n";
import { buildSourcesMetadata } from "../../lib/site";

// /en/sources, /zh/sources … 만 만든다. 그 밖의 경로는 404.
export const dynamicParams = false;
// 법무부 최신 기준일을 다시 확인하는 주기 — api/student-data의 revalidate와 같은 6시간
export const revalidate = 21_600;

export function generateStaticParams() {
  return FOREIGN_LANGS.map((lang) => ({ lang }));
}

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang) || lang === "ko") return {};
  return buildSourcesMetadata(lang);
}

export default async function LangSources({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang) || lang === "ko") notFound();
  return <SourcesPage lang={lang} />;
}
