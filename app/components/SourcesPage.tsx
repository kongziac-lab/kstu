// 데이터 출처·업데이트 현황 페이지 본문(서버 컴포넌트). 법무부 최신 기준일은 공공데이터포털
// OAS에서, 교육부 수록 연도는 빌드 때 만든 moe-yearly.json에서 읽는다. 둘 다 실패하면 해당 칸만
// "확인할 수 없음"으로 표시한다.
import { DICTS, HTML_LANG, LANGS, LANG_NAMES, langPath, sourcesPath, type Lang } from "../lib/i18n";
import { getMoeYearly } from "../lib/moe-data";
import { getMojLatestAsOf } from "../lib/moj-data";

const MOJ_URL = "https://www.data.go.kr/data/3069982/fileData.do";
const MOE_URL = "https://kess.kedi.re.kr/contents/dataset?itemCode=04&menuId=m_02_04_03_02";

// 법무부 자료는 6/30·12/31 기준으로 나오고, 공공데이터포털에는 기준일 사흘 뒤쯤 등록된다
// (20260630 자료 → 2026-07-03 등록, 포털의 차기 등록 예정일 2027-01-03).
function nextMojRelease(asOf: string) {
  const y = Number(asOf.slice(0, 4));
  return asOf.endsWith("06-30")
    ? { asOf: `${y}-12-31`, publish: `${y + 1}-01-03` }
    : { asOf: `${y + 1}-06-30`, publish: `${y + 1}-07-03` };
}

/** 한국 시간 "YYYY-MM-DD HH:mm" */
function formatKst(date: Date) {
  return date.toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false }).slice(0, 16);
}

export default async function SourcesPage({ lang }: { lang: Lang }) {
  const t = DICTS[lang];
  const [mojAsOf, moe] = await Promise.all([
    getMojLatestAsOf().catch(() => null),
    getMoeYearly().catch(() => null),
  ]);
  const mojNext = mojAsOf ? nextMojRelease(mojAsOf) : null;
  const moeLatest = moe?.series[moe.series.length - 1];
  const mojLink = <a href={MOJ_URL} target="_blank" rel="noopener noreferrer">{MOJ_URL}</a>;
  const moeLink = <a href={MOE_URL} target="_blank" rel="noopener noreferrer">{MOE_URL}</a>;

  const sources = [
    {
      key: "moj",
      label: t.srcMoj,
      rows: [
        [t.srcRowDataset, t.srcMojDataset],
        [t.srcRowProvider, t.srcMojProvider],
        [t.srcRowCurrent, mojAsOf ? <strong className="sources-current">{t.srcMojCurrent(mojAsOf)}</strong> : t.srcUnavailable],
        [t.srcRowCycle, t.srcMojCycle],
        [t.srcRowNext, mojNext ? t.srcMojNext(mojNext.asOf, mojNext.publish) : t.srcUnavailable],
        [t.srcRowMethod, t.srcMojMethod],
        [t.srcRowLink, mojLink],
      ],
    },
    {
      key: "moe",
      label: t.srcMoe,
      rows: [
        [t.srcRowDataset, t.srcMoeDataset],
        [t.srcRowProvider, t.srcMoeProvider],
        [
          t.srcRowCurrent,
          moe && moeLatest ? (
            <strong className="sources-current">
              {t.srcMoeCurrent(moe.years[0], moeLatest.year, moeLatest.total.toLocaleString(HTML_LANG[lang]))}
            </strong>
          ) : t.srcUnavailable,
        ],
        [t.srcRowCycle, t.srcMoeCycle],
        [t.srcRowNext, moeLatest ? t.srcMoeNext(moeLatest.year + 1) : t.srcUnavailable],
        [t.srcRowMethod, t.srcMoeMethod],
        [t.srcRowLink, moeLink],
      ],
    },
  ] as const;

  return (
    <div className="app-shell" lang={HTML_LANG[lang]}>
      <header className="topbar">
        <div className="brand-mark">K</div>
        <div className="brand"><strong>{t.brandName}</strong><span>{t.brandSub}</span></div>
      </header>

      <main className="sources-main">
        <a className="sources-back" href={langPath(lang)}>{t.srcBack}</a>
        <div className="hero">
          <div>
            <p className="eyebrow">DATA SOURCES</p>
            <h1>{t.srcPageTitle}</h1>
            <p>{t.srcPageIntro}</p>
          </div>
        </div>
        <p className="sources-checked">{t.srcCheckedAt(formatKst(new Date()))}</p>

        <div className="sources-list">
          {sources.map((s) => (
            <section key={s.key} className="panel">
              <div className="panel-head">
                <div><span>{s.label}</span><h2>{s.rows[0][1]}</h2></div>
              </div>
              <dl>
                {s.rows.slice(1).map(([dt, dd]) => [<dt key={`${dt}-t`}>{dt}</dt>, <dd key={`${dt}-d`}>{dd}</dd>])}
              </dl>
            </section>
          ))}
          <aside className="sources-note">
            <h2>{t.srcNoteTitle}</h2>
            <p>{t.srcNoteBody}</p>
          </aside>
        </div>
      </main>

      <nav className="lang-links" aria-label={t.language}>
        {LANGS.map((l) => <a key={l} href={sourcesPath(l)} hrefLang={HTML_LANG[l]} lang={HTML_LANG[l]} aria-current={l === lang ? "page" : undefined}>{LANG_NAMES[l]}</a>)}
      </nav>
    </div>
  );
}
