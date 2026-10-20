"use client";

import { useEffect, useMemo, useState } from "react";
import { getCertification, prioritizeKeimyung, resolveHigherEducationInstitution } from "../lib/school-names";
import { orderStatuses } from "../lib/moj-status";
import type { Dataset, Row, SchoolAggregate, TrendSeries } from "../lib/types";
import { useLang } from "../lib/lang-context";
import { countryName, genderName, schoolName, statusName } from "../lib/value-names";

const fmt = new Intl.NumberFormat("ko-KR");
const DEFAULT_SCHOOL = "전체 기관명";

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function aggregate(rows: Row[], index: 0 | 1 | 2 | 3) {
  const map = new Map<string, number>();
  rows.forEach((r) => map.set(r[index], (map.get(r[index]) || 0) + r[4]));
  return [...map].sort((a, b) => b[1] - a[1]);
}

function aggregateSchools(rows: Row[]) {
  const map = new Map<string, SchoolAggregate>();
  rows.forEach((r) => {
    const name = resolveHigherEducationInstitution(r[0]);
    if (!name) return;
    const item: SchoolAggregate = map.get(name) || { name, value: 0, variants: [] };
    item.value += r[4];
    const variant = item.variants.find((v) => v.name === r[0]);
    if (variant) variant.value += r[4];
    else item.variants.push({ name: r[0], value: r[4] });
    map.set(name, item);
  });
  return [...map.values()]
    .map((item) => ({ ...item, variants: item.variants.sort((a, b) => b.value - a.value) }))
    .sort((a, b) => b.value - a.value);
}

function hasHigherEducationInstitution(row: Row) {
  return Boolean(resolveHigherEducationInstitution(row[0]));
}

/** 법무부 유학생관리정보(반기, 2019~) 대시보드 본문. */
export default function MojBody() {
  const { lang, t } = useLang();
  const DEFAULT_SCHOOL_LABEL = t.allSchools;
  const DEFAULT_SCHOOL_QUERY = DEFAULT_SCHOOL_LABEL;
  const cn = (v: string) => countryName(v, lang);
  const sn = (v: string) => statusName(v, lang);
  const [data, setData] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [schoolQuery, setSchoolQuery] = useState(DEFAULT_SCHOOL_QUERY);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [country, setCountry] = useState("전체 국가");
  const [status, setStatus] = useState("전체 체류자격");
  const [gender, setGender] = useState("전체 성별");
  const [search, setSearch] = useState("");
  const [countryDetailOpen, setCountryDetailOpen] = useState(false);
  const [courseView, setCourseView] = useState("학사과정");
  const [schoolDisplayLimit, setSchoolDisplayLimit] = useState(10);
  const [certificationView, setCertificationView] = useState("전체 인증");
  const [unknownOpen, setUnknownOpen] = useState(false);
  const [openVariants, setOpenVariants] = useState<string[]>([]);
  const [trend, setTrend] = useState<TrendSeries | null>(null);
  const [trendError, setTrendError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    let active = true;

    fetch("/api/student-data", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`데이터 요청 실패: ${response.status}`);
        return response.json() as Promise<Dataset>;
      })
      .then((dataset) => {
        if (active) setData(dataset);
      })
      .catch(() => {
        if (active) setLoadError(t.loadFail);
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadAttempt, t.loadFail]);

  // 시계열 변동 데이터 로드 (빌드 시 생성된 정적 파일에서 직접 로드 => 즉시)
  useEffect(() => {
    const controller = new AbortController();
    fetch("/trend-data.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("trend fail");
        return response.json() as Promise<TrendSeries>;
      })
      .then((d) => setTrend(d))
      .catch(() => setTrendError(true));
    return () => controller.abort();
  }, []);

  const options = useMemo(() => {
    if (!data) return { schools: [], countries: [], statuses: [], genders: [] };
    return {
      schools: prioritizeKeimyung(aggregateSchools(data.rows).map(({ name }) => name)),
      countries: aggregate(data.rows, 1).map(([v]) => v),
      statuses: orderStatuses(aggregate(data.rows, 2)).map(([v]) => v),
      genders: aggregate(data.rows, 3).map(([v]) => v),
    };
  }, [data]);

  const schoolSuggestions = useMemo(() => {
    const query = schoolQuery.trim().toLocaleLowerCase("ko");
    const selectableSchools = options.schools.filter((name) => name !== "미상");
    const isDefaultQuery = !query || schoolQuery === DEFAULT_SCHOOL_LABEL || schoolQuery === DEFAULT_SCHOOL;
    const matches = !isDefaultQuery
      ? selectableSchools.filter((name) => name.toLocaleLowerCase("ko").includes(query))
      : selectableSchools;
    return matches.slice(0, 10);
  }, [options.schools, schoolQuery, DEFAULT_SCHOOL_LABEL]);

  const filtered = useMemo(() => (data?.rows || []).filter((r) =>
    (school === "전체 기관명" || resolveHigherEducationInstitution(r[0]) === school) &&
    (country === "전체 국가" || r[1] === country) &&
    (status === "전체 체류자격" || r[2] === status) &&
    (gender === "전체 성별" || r[3] === gender)
  ), [data, school, country, status, gender]);

  const higherEducationRows = filtered.filter(hasHigherEducationInstitution);
  const total = higherEducationRows.reduce((sum, r) => sum + r[4], 0);
  const countries = aggregate(higherEducationRows, 1);
  const statuses = orderStatuses(aggregate(higherEducationRows, 2));
  const statusMax = Math.max(...statuses.map(([, value]) => value), 1);
  const genders = aggregate(higherEducationRows, 3);
  const higherEducationInstitutions = aggregateSchools(higherEducationRows);
  const courseBaseRows = useMemo(() => (data?.rows || []).filter((r) =>
    (school === "전체 기관명" || resolveHigherEducationInstitution(r[0]) === school) &&
    (country === "전체 국가" || r[1] === country) &&
    (gender === "전체 성별" || r[3] === gender) &&
    hasHigherEducationInstitution(r)
  ), [data, school, country, gender]);
  const courseCountries = aggregate(courseBaseRows.filter((r) => r[2] === courseView), 1);
  const courseTotal = courseCountries.reduce((sum, [, value]) => sum + value, 0);
  const courseCountryMax = courseCountries[0]?.[1] || 1;
  const schools = higherEducationInstitutions.filter(({ name }) => {
    const certification = getCertification(name);
    return name.includes(search) &&
      (certificationView === "전체 인증" ||
        certification === certificationView ||
        (certificationView === "미표기" && !certification));
  });
  const visibleSchoolLimit = Math.min(schoolDisplayLimit, schools.length);

  // 시계열 변동 차트: 선택된 학교의 총원 / 체류자격 / 상위 국가 추이
  const trendSchool = trend?.series?.map((p) => {
    const totalForSchool = p.schools.find((s) => s.name === school);
    return { asOf: p.asOf.slice(2, 7).replace("-", "."), total: totalForSchool?.count ?? 0 };
  }) ?? [];
  const trendStatus = trend?.series?.map((p) => {
    const rows = p.status.filter((s) => s.school === school);
    const byStatus: Record<string, number> = {};
    rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + r.count; });
    return { asOf: p.asOf.slice(2, 7).replace("-", "."), ...byStatus };
  }) ?? [];
  const trendCountry = trend?.series?.map((p) => {
    const rows = p.country.filter((c) => c.school === school);
    const byCountry: Record<string, number> = {};
    rows.forEach((r) => { byCountry[r.country] = (byCountry[r.country] || 0) + r.count; });
    return { asOf: p.asOf.slice(2, 7).replace("-", "."), ...byCountry };
  }) ?? [];
  // 학교 미선택 시 전체 유학생 추이
  const trendAll = trend?.series?.map((p) => ({ asOf: p.asOf.slice(2, 7).replace("-", "."), total: p.total })) ?? [];
  const statusesFromTrend = Array.from(new Set((trend?.series ?? []).flatMap((p) => p.status.map((s) => s.status))));
  const trendCountries = Array.from(new Set((trend?.series ?? []).flatMap((p) => p.country.map((c) => c.country))))
    .filter((c) => c !== "미상")
    .slice(0, 8);

  const unknownRows = (data?.rows || []).filter((r) => r[0] === "미상");
  const unknownTotal = unknownRows.reduce((sum, r) => sum + r[4], 0);
  const unknownCountries = aggregate(unknownRows, 1);
  const unknownStatuses = orderStatuses(aggregate(unknownRows, 2));
  const unknownCombinations = [...unknownRows.reduce((map, r) => {
    const key = `${cn(r[1])} · ${sn(r[2])}`;
    map.set(key, (map.get(key) || 0) + r[4]);
    return map;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const male = genders.find(([name]) => name === "남")?.[1] || 0;
  const female = genders.find(([name]) => name === "여")?.[1] || 0;
  const malePct = total ? Math.round((male / total) * 1000) / 10 : 0;
  const femalePct = total ? Math.round((female / total) * 1000) / 10 : 0;

  const reset = () => { setSchool(DEFAULT_SCHOOL); setSchoolQuery(DEFAULT_SCHOOL_QUERY); setSchoolOpen(false); setCountry("전체 국가"); setStatus("전체 체류자격"); setGender("전체 성별"); setSearch(""); setCountryDetailOpen(false); setCourseView("학사과정"); setCertificationView("전체 인증"); setSchoolDisplayLimit(10); setOpenVariants([]); };

  const chooseSchool = (name: string) => {
    setSchool(name);
    setSchoolQuery(name === DEFAULT_SCHOOL ? DEFAULT_SCHOOL_LABEL : name);
    setSchoolOpen(false);
  };

  const toggleVariants = (name: string) => {
    setOpenVariants((items) => items.includes(name) ? items.filter((v) => v !== name) : [...items, name]);
  };

  if (!data) return <main className="loading">{loadError ? <><p>{loadError}</p><button type="button" onClick={() => { setLoadError(null); setLoadAttempt((value) => value + 1); }}>{t.retry}</button></> : <><div className="loader"/><p>{t.loadingMoj}</p></>}</main>;

  // "YYYY-MM-DD" -> "YYYY. MM. DD." — Date 객체를 거치지 않아 표시 시점의
  // 타임존에 따라 날짜가 하루 밀리는 문제를 피한다.
  const asOfMatch = data.meta.asOf?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const asOfLabel = asOfMatch ? `${asOfMatch[1]}. ${asOfMatch[2]}. ${asOfMatch[3]}.` : "-";

  return (
    <main>
      <section className="hero">
        <div><p className="eyebrow">IMMIGRATION DATA INSIGHT</p><h1>{t.heroTitleMoj}</h1><p>{t.heroDescMoj}</p></div>
        <div className="asof"><span>{t.asOfLabel}</span><strong>{asOfLabel}</strong><small>{t.asOfSourceMoj}</small></div>
      </section>

      <section className="filters" aria-label={t.filtersAria}>
        <label className="school-filter"><span>{t.school}</span><div className="school-combobox"><input value={schoolQuery} onFocus={() => setSchoolOpen(true)} onChange={(e) => { setSchoolQuery(e.target.value); setSchool("전체 기관명"); setSchoolOpen(true); }} onKeyDown={(e) => { if (e.key === "Escape") setSchoolOpen(false); }} placeholder={t.schoolSearch} aria-label={t.schoolSearch} role="combobox" aria-expanded={schoolOpen} aria-controls="school-options-list"/><button type="button" onClick={() => { setSchoolQuery(""); setSchool("전체 기관명"); setSchoolOpen(true); }} aria-label={t.clearSchool}>×</button>{schoolOpen && <div className="school-options" id="school-options-list" role="listbox"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSchool("전체 기관명")}>{DEFAULT_SCHOOL_LABEL}</button>{schoolSuggestions.map((name) => <button type="button" key={name} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSchool(name)}>{name}</button>)}{schoolSuggestions.length === 0 && <em>{t.noResults}</em>}</div>}</div></label>
        <label><span>{t.country}</span><select aria-label={t.country} value={country} onChange={(e) => setCountry(e.target.value)}><option value="전체 국가">{t.allCountries}</option>{options.countries.map((v) => <option key={v} value={v}>{cn(v)}</option>)}</select></label>
        <label><span>{t.status}</span><select aria-label={t.status} value={status} onChange={(e) => setStatus(e.target.value)}><option value="전체 체류자격">{t.allStatuses}</option>{options.statuses.map((v) => <option key={v} value={v}>{sn(v)}</option>)}</select></label>
        <label><span>{t.gender}</span><select aria-label={t.gender} value={gender} onChange={(e) => setGender(e.target.value)}><option value="전체 성별">{t.allGenders}</option>{options.genders.map((v) => <option key={v} value={v}>{genderName(v, lang)}</option>)}</select></label>
        <button className="reset" onClick={reset}>{t.reset}</button>
      </section>

      <section className="kpis">
        <article><div className="kpi-icon mint"><Icon>人</Icon></div><div><span>{t.kpiStudents}</span><strong>{fmt.format(total)}<small>{t.unitPeople}</small></strong><em>{t.kpiStudentsNoteMoj}</em></div></article>
        <article><div className="kpi-icon blue"><Icon>校</Icon></div><div><span>{t.kpiSchools}</span><strong>{fmt.format(higherEducationInstitutions.length)}<small>{t.unitCount}</small></strong><em>{t.kpiSchoolsNoteMoj}</em></div></article>
        <article><div className="kpi-icon orange"><Icon>國</Icon></div><div><span>{t.kpiCountries}</span><strong>{fmt.format(countries.length)}<small>{t.unitCountries}</small></strong><em>{t.kpiCountriesNote}</em></div></article>
        <article><div className="kpi-icon violet"><Icon>證</Icon></div><div><span>{t.kpiStatuses}</span><strong>{fmt.format(statuses.length)}<small>{t.unitCount}</small></strong><em>{t.kpiStatusesNote}</em></div></article>
      </section>

      <section className="chart-grid">
        <article className="panel wide country-panel"><div className="panel-head"><div><span>{t.countryEyebrow}</span><h2>{t.countryTitle}</h2></div><b>{countryDetailOpen ? t.allN(fmt.format(countries.length)) : t.top8}</b></div><div className="bars">{countries.slice(0, countryDetailOpen ? countries.length : 8).map(([name, value], i) => <div className="bar-row" key={name}><span className="rank">{String(i + 1).padStart(2,"0")}</span><strong>{cn(name)}</strong><div className="bar-track"><i style={{width: `${(value / (countries[0]?.[1] || 1)) * 100}%`}}/></div><b>{fmt.format(value)}</b><small>{total ? ((value / total) * 100).toFixed(1) : 0}%</small></div>)}</div><button className="country-detail-toggle" type="button" onClick={() => setCountryDetailOpen((v) => !v)} aria-expanded={countryDetailOpen}>{countryDetailOpen ? t.collapseCountries : t.showAllCountries(fmt.format(countries.length))}<span aria-hidden="true">{countryDetailOpen ? "⌃" : "⌄"}</span></button></article>
        <article className="panel gender-panel"><div className="panel-head"><div><span>{t.genderEyebrow}</span><h2>{t.genderTitle}</h2></div></div><div className="donut-wrap"><div className="donut" style={{background: `conic-gradient(#0c6f68 0 ${malePct}%, #ef8c68 ${malePct}% 100%)`}}><div><strong>{fmt.format(total)}</strong><span>{t.total}</span></div></div></div><div className="legend"><div><i className="male"/><span>{t.male}</span><strong>{fmt.format(male)}</strong><b>{malePct}%</b></div><div><i className="female"/><span>{t.female}</span><strong>{fmt.format(female)}</strong><b>{femalePct}%</b></div></div></article>
      </section>

      <section className="chart-grid lower">
        <article className="panel status-panel"><div className="panel-head"><div><span>{t.statusEyebrow}</span><h2>{t.statusTitle}</h2></div></div><div className="status-list">{statuses.map(([name,value],i) => <div key={name}><div><span>{sn(name)}</span><b>{t.ppl(fmt.format(value))}</b></div><div className="status-track"><i className={`c${i}`} style={{width:`${(value/statusMax)*100}%`}}/></div><small>{total ? ((value/total)*100).toFixed(1) : 0}%</small></div>)}</div></article>
        <article className="panel table-panel"><div className="panel-head table-title"><div><span>{t.schoolEyebrow}</span><h2>{t.schoolTitleMoj}</h2><p className="data-caution">{t.schoolNoteMoj}</p>{t.schoolNameNote && <p className="school-name-note">{t.schoolNameNote}</p>}</div><div className="table-tools"><label className="cert-filter"><span>{t.certView}</span><select value={certificationView} onChange={(e)=>{ setCertificationView(e.target.value); setSchoolDisplayLimit(10); setOpenVariants([]); }} aria-label={t.certAria}><option value="전체 인증">{t.certAll}</option><option value="우수">{t.certExcellent}</option><option value="일반">{t.certGeneral}</option><option value="미표기">{t.certNone}</option></select></label><label className="search">⌕<input value={search} onChange={(e)=>{ setSearch(e.target.value); setSchoolDisplayLimit(10); setOpenVariants([]); }} placeholder={t.schoolSearch} aria-label={t.schoolSearch}/></label></div></div><div className="school-table"><div className="tr th"><span>{t.thRank}</span><span>{t.thSchool}</span><span>{t.thStudents}</span><span>{t.thShare}</span></div>{schools.slice(0, visibleSchoolLimit).map(({ name, value, variants },i)=>{ const certification = getCertification(name); const variantsOpen = openVariants.includes(name); return <div className="school-row-group" key={name}><div className="tr"><span>{i+1}</span><strong>{schoolName(name, lang)}{certification && <em className={`cert-badge ${certification === "우수" ? "excellent" : ""}`}>{t.certBadge(certification as "우수" | "일반")}</em>}{variants.length > 1 && <button className="variant-toggle" type="button" onClick={() => toggleVariants(name)} aria-expanded={variantsOpen}>{variantsOpen ? t.variantsHide : t.variantsShow(variants.length)}<span>{variantsOpen ? "⌃" : "⌄"}</span></button>}</strong><b>{t.ppl(fmt.format(value))}</b><span>{total ? ((value/total)*100).toFixed(1):0}%</span></div>{variantsOpen && <div className="variant-list">{variants.map((variant) => <div key={variant.name}><span>{variant.name}</span><b>{t.ppl(fmt.format(variant.value))}</b><small>{value ? ((variant.value / value) * 100).toFixed(1) : 0}%</small></div>)}</div>}</div>; })}</div>{schools.length === 0 && <p className="empty-table">{t.noSchools}</p>}<div className="rank-actions"><p>{t.showingOf(fmt.format(schools.length), fmt.format(visibleSchoolLimit))}</p>{visibleSchoolLimit < schools.length && <button className="expand-schools" type="button" onClick={() => setSchoolDisplayLimit((v) => Math.min(v + 30, schools.length))}>{t.next30}</button>}{visibleSchoolLimit > 10 && <button className="collapse-schools" type="button" onClick={() => setSchoolDisplayLimit(10)}>{t.top10Only}</button>}</div></article>
      </section>

      <section className="course-country-section">
        <article className="panel course-country-panel"><div className="panel-head"><div><span>{t.courseEyebrow}</span><h2>{t.courseTitle}</h2><p className="course-country-note">{t.courseNote}</p></div><b>{t.ppl(fmt.format(courseTotal))}</b></div><div className="course-tabs" role="tablist" aria-label={t.courseTabsAria}>{options.statuses.map((name) => <button type="button" role="tab" aria-selected={courseView === name} className={courseView === name ? "active" : ""} key={name} onClick={() => setCourseView(name)}>{sn(name)}</button>)}</div><div className="course-country-summary"><div><span>{t.selectedCourse}</span><strong>{sn(courseView)}</strong></div><div><span>{t.students}</span><strong>{t.ppl(fmt.format(courseTotal))}</strong></div><div><span>{t.kpiCountries}</span><strong>{fmt.format(courseCountries.length)}{t.unitCountries}</strong></div></div>{courseCountries.length > 0 ? <div className="course-country-table"><div className="course-country-head"><span>{t.thRank}</span><span>{t.thCountry}</span><span>{t.thDistribution}</span><span>{t.thStudents}</span><span>{t.thShareInCourse}</span></div><div className="course-country-list">{courseCountries.map(([name, value], i) => <div className="course-country-row" key={name}><span>{fmt.format(i + 1)}</span><strong>{cn(name)}</strong><div className="course-country-track"><i style={{width: `${(value / courseCountryMax) * 100}%`}}/></div><b>{t.ppl(fmt.format(value))}</b><small>{courseTotal ? ((value / courseTotal) * 100).toFixed(1) : 0}%</small></div>)}</div><p>{t.courseRankNote(sn(courseView), fmt.format(courseCountries.length))}</p></div> : <p className="empty-course-country">{t.courseEmpty(sn(courseView))}</p>}</article>
      </section>

      <section className="trend-section">
        <article className="panel trend-panel">
          <div className="panel-head"><div><span>{t.trendEyebrow}</span><h2>{t.trendTitleMoj(school === "전체 기관명" ? null : school)}</h2><p className="trend-note">{t.trendNoteMoj[0]}<strong>{t.trendNoteMoj[1]}</strong>{t.trendNoteMoj[2]}<strong>{t.trendNoteMoj[3]}</strong>{t.trendNoteMoj[4]}</p></div><b>{fmt.format(school === "전체 기관명" ? (trendAll[trendAll.length - 1]?.total ?? 0) : (trendSchool[trendSchool.length - 1]?.total ?? 0))}<small>{t.latest}</small></b></div>
          {trendError ? <p className="trend-error">{t.trendError}</p> : !trend ? <p className="trend-loading">{t.trendLoading}</p> : (
            <>
              <div className="trend-chart">
                {(school === "전체 기관명" ? trendAll : trendSchool).map((point) => {
                  const data = school === "전체 기관명" ? trendAll : trendSchool;
                  const max = Math.max(...data.map((p) => p.total), 1);
                  return <div className="trend-col" key={point.asOf}><div className="trend-bar-wrap"><div className="trend-val">{fmt.format(point.total)}</div><i className={`trend-bar ${point.asOf.endsWith(".12") ? "h2" : "h1"}`} style={{ height: `${(point.total / max) * 100}%` }} title={`${point.asOf}: ${t.ppl(fmt.format(point.total))}`}/></div><span>{point.asOf}</span></div>;
                })}
              </div>
              <div className="trend-legend"><span><i className="h1"/>{t.legendH1}</span><span><i className="h2"/>{t.legendH2}</span></div>
              {school !== "전체 기관명" && (
                <div className="trend-breakdown">
                  <h3>{t.statusChange}</h3>
                  <table className="trend-table"><thead><tr><th>{t.asOfCol}</th>{statusesFromTrend.map((s) => <th key={s}>{sn(s)}</th>)}</tr></thead><tbody>{trendStatus.map((row) => <tr key={row.asOf}><td>{row.asOf}</td>{statusesFromTrend.map((s) => <td key={s}>{fmt.format(Number((row as Record<string, unknown>)[s]) || 0)}</td>)}</tr>)}</tbody></table>
                  <h3>{t.countryChangeMoj(trendCountries.length)}</h3>
                  <table className="trend-table"><thead><tr><th>{t.asOfCol}</th>{trendCountries.map((c) => <th key={c}>{cn(c)}</th>)}</tr></thead><tbody>{trendCountry.map((row) => <tr key={row.asOf}><td>{row.asOf}</td>{trendCountries.map((c) => <td key={c}>{fmt.format(Number((row as Record<string, unknown>)[c]) || 0)}</td>)}</tr>)}</tbody></table>
                </div>
              )}
            </>
          )}
        </article>
      </section>

      <section className="unknown-panel">
        <div className="unknown-heading">
          <div><span>DATA QUALITY NOTE</span><h2>{t.unknownTitle}</h2><p>{t.unknownDesc}</p></div>
          <strong>{fmt.format(unknownTotal)}<small>{t.unitPeople}</small><em>{t.ofTotal(String(data.meta.total ? ((unknownTotal / data.meta.total) * 100).toFixed(1) : 0))}</em></strong>
        </div>
        <button className="unknown-toggle" type="button" onClick={() => setUnknownOpen((v) => !v)} aria-expanded={unknownOpen}>{unknownOpen ? t.collapse : t.expand}</button>
        {unknownOpen && <>
          <div className="unknown-facts">
            <div><b>{fmt.format(unknownCountries.length)}</b><span>{t.nationalitiesUnit}</span></div>
            <div><b>{fmt.format(unknownStatuses.length)}</b><span>{t.statusesUnit}</span></div>
            <p>{t.unknownFact}</p>
          </div>
          <div className="unknown-grid">
            <div><h3>{t.topNationalities}</h3>{unknownCountries.slice(0, 5).map(([name, value]) => <div className="unknown-row" key={name}><span>{cn(name)}</span><b>{t.ppl(fmt.format(value))}</b><small>{unknownTotal ? ((value / unknownTotal) * 100).toFixed(1) : 0}%</small></div>)}</div>
            <div><h3>{t.statusDist}</h3>{unknownStatuses.map(([name, value]) => <div className="unknown-row" key={name}><span>{sn(name)}</span><b>{t.ppl(fmt.format(value))}</b><small>{unknownTotal ? ((value / unknownTotal) * 100).toFixed(1) : 0}%</small></div>)}</div>
            <div><h3>{t.topCombos}</h3>{unknownCombinations.slice(0, 5).map(([name, value]) => <div className="unknown-row" key={name}><span>{name}</span><b>{t.ppl(fmt.format(value))}</b><small>{unknownTotal ? ((value / unknownTotal) * 100).toFixed(1) : 0}%</small></div>)}<p className="unknown-caution">{t.unknownCaution}</p></div>
          </div>
        </>}
      </section>

      <footer><span>{t.footerSourceMoj}</span><p>{t.footerNoteMoj}</p><b>{t.rawTotal(fmt.format(data.meta.total))}</b></footer>
    </main>
  );
}
