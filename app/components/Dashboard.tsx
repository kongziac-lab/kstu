"use client";

import { useEffect, useState } from "react";
import MojBody from "./MojBody";
import MoeBody from "./MoeBody";
import type { DataSource } from "../lib/types";
import { DICTS, HTML_LANG, LANGS, LANG_NAMES, langPath, type Lang } from "../lib/i18n";
import { LangProvider } from "../lib/lang-context";

export default function Dashboard({ lang }: { lang: Lang }) {
  const t = DICTS[lang];
  const [source, setSource] = useState<DataSource>("moj");

  // 루트 레이아웃은 <html lang="ko">로 고정이라, 언어별 페이지에서는 여기서 바꿔 준다.
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const sources: { id: DataSource; label: string; hint: string }[] = [
    { id: "moj", label: t.srcMoj, hint: t.srcMojHint },
    { id: "moe", label: t.srcMoe, hint: t.srcMoeHint },
  ];

  return (
    <LangProvider value={lang}>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-mark">K</div>
          <div className="brand"><strong>{t.brandName}</strong><span>{t.brandSub}</span></div>
          <div className="topbar-tools">
            <label className="lang-switch">
              <span aria-hidden="true">文A</span>
              <select
                aria-label={t.language}
                value={lang}
                onChange={(e) => { window.location.href = langPath(e.target.value as Lang); }}
              >
                {LANGS.map((l) => <option key={l} value={l} lang={HTML_LANG[l]}>{LANG_NAMES[l]}</option>)}
              </select>
            </label>
            <div className="source-toggle" role="tablist" aria-label={t.sourceAria}>
              {sources.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={source === s.id}
                  className={source === s.id ? "active" : ""}
                  onClick={() => setSource(s.id)}
                >
                  <strong>{s.label}</strong>
                  <small>{s.hint}</small>
                </button>
              ))}
            </div>
          </div>
        </header>

        {source === "moj" ? <MojBody /> : <MoeBody />}

        <nav className="lang-links" aria-label={t.language}>
          {LANGS.map((l) => <a key={l} href={langPath(l)} hrefLang={HTML_LANG[l]} lang={HTML_LANG[l]} aria-current={l === lang ? "page" : undefined}>{LANG_NAMES[l]}</a>)}
        </nav>
      </div>
    </LangProvider>
  );
}
