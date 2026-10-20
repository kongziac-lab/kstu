import { notFound } from "next/navigation";
import Dashboard from "../components/Dashboard";
import { FOREIGN_LANGS, isLang } from "../lib/i18n";
import { buildMetadata } from "../lib/site";

// /en, /zh, /vi, /ne, /mn, /uz 만 만든다. 그 밖의 경로는 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return FOREIGN_LANGS.map((lang) => ({ lang }));
}

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang) || lang === "ko") return {};
  return buildMetadata(lang);
}

export default async function LangHome({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang) || lang === "ko") notFound();
  return <Dashboard lang={lang} />;
}
