"use client";

import { useEffect, useMemo, useState } from "react";
import { prioritizeKeimyung } from "../lib/school-names";
import type { MoeCross, MoeSchoolTrend, MoeYearly, MoeYearPoint } from "../lib/types";

const fmt = new Intl.NumberFormat("ko-KR");
const DEFAULT_SCHOOL = "전체 기관명";
const DEFAULT_SCHOOL_LABEL = "전체 고등교육기관명";

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function topEntries<T extends { total: number } | { count: number }>(items: T[], limit: number) {
  return items.slice(0, limit);
}

/** 교육부/KEDI 고등교육기관 외국인 유학생 현황(연 1회 4월 1일 기준, 2013~2025) 대시보드 본문. */
export default function MoeBody() {
  const [yearly, setYearly] = useState<MoeYearly | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [year, setYear] = useState<number | null>(null);
  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [schoolQuery, setSchoolQuery] = useState(DEFAULT_SCHOOL_LABEL);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [schoolDisplayLimit, setSchoolDisplayLimit] = useState(10);
  const [countryDetailOpen, setCountryDetailOpen] = useState(false);
  // 연도별 캐시/에러. ref가 아닌 state로 두어 렌더 중 읽어도 안전하도록 한다(refs는 렌더 중 접근 금지).
  const [crossByYear, setCrossByYear] = useState<Record<number, MoeCross>>({});
  const [crossErrorYears, setCrossErrorYears] = useState<Record<number, boolean>>({});
  // 학교별 전 연도(2013~2025) 추이. 연도 무관 파일이라 최초 학교 선택 시 한 번만 받는다.
  const [schoolTrend, setSchoolTrend] = useState<MoeSchoolTrend | null>(null);
  const [schoolTrendError, setSchoolTrendError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/moe-yearly.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`데이터 요청 실패: ${response.status}`);
        return response.json() as Promise<MoeYearly>;
      })
      .then((data) => {
        setYearly(data);
        setYear((current) => current ?? data.years[data.years.length - 1]);
      })
      .catch(() => setLoadError("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    return () => controller.abort();
  }, [loadAttempt]);

  const point: MoeYearPoint | null = useMemo(() => {
    if (!yearly || year == null) return null;
    return yearly.series.find((p) => p.year === year) ?? null;
  }, [yearly, year]);

  // 학교 선택 시 해당 연도의 학교x국가 교차표를 지연 로딩한다(연도별 파일이 분리되어 있음).
  useEffect(() => {
    if (school === DEFAULT_SCHOOL || year == null || crossByYear[year] || crossErrorYears[year]) return;
    const controller = new AbortController();
    fetch(`/moe-cross-${year}.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`cross 요청 실패: ${response.status}`);
        return response.json() as Promise<MoeCross>;
      })
      .then((data) => {
        setCrossByYear((prev) => ({ ...prev, [year]: data }));
      })
      .catch(() => setCrossErrorYears((prev) => ({ ...prev, [year]: true })));
    return () => controller.abort();
  }, [school, year, crossByYear, crossErrorYears]);

  const cross = year != null ? crossByYear[year] : undefined;
  const crossError = year != null ? Boolean(crossErrorYears[year]) : false;
  const crossLoading = school !== DEFAULT_SCHOOL && year != null && !cross && !crossError;

  // 학교 선택 시 전 연도 추이 파일을 1회만 지연 로딩한다(연도 전환과 무관하게 캐시).
  useEffect(() => {
    if (school === DEFAULT_SCHOOL || schoolTrend || schoolTrendError) return;
    const controller = new AbortController();
    fetch("/moe-school-trend.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`school-trend 요청 실패: ${response.status}`);
        return response.json() as Promise<MoeSchoolTrend>;
      })
      .then((data) => setSchoolTrend(data))
      .catch(() => setSchoolTrendError(true));
    return () => controller.abort();
  }, [school, schoolTrend, schoolTrendError]);

  if (loadError && !yearly) {
    return <main className="loading"><p>{loadError}</p><button type="button" onClick={() => { setLoadError(null); setLoadAttempt((v) => v + 1); }}>다시 시도</button></main>;
  }
  if (!yearly || !point || year == null) {
    return <main className="loading"><div className="loader" /><p>교육부 유학생 현황을 불러오는 중입니다</p></main>;
  }

  const schoolOptions = prioritizeKeimyung(point.bySchool.map(({ school: name }) => name));
  const schoolSuggestions = (() => {
    const query = schoolQuery.trim().toLocaleLowerCase("ko");
    const isDefaultQuery = !query || schoolQuery === DEFAULT_SCHOOL_LABEL || schoolQuery === DEFAULT_SCHOOL;
    const matches = !isDefaultQuery
      ? schoolOptions.filter((name) => name.toLocaleLowerCase("ko").includes(query))
      : schoolOptions;
    return matches.slice(0, 10);
  })();

  // 학교 선택 시: 법무부와 동일하게 KPI·국가별·전공계열·과정유형 패널이 모두
  // 그 학교 기준으로 다시 계산된다. 상세 데이터(byField/byProgram/국가 교차)는
  // 연도별 지연 로딩 파일(cross)에만 있으므로, 선택 직후 잠깐 로딩 상태를 거친다.
  const isSchoolSelected = school !== DEFAULT_SCHOOL;
  const schoolIndex = isSchoolSelected ? yearly.dict.schools.indexOf(school) : -1;
  const schoolDetail = isSchoolSelected && cross && schoolIndex >= 0 ? cross.schools[schoolIndex] : undefined;

  const total = isSchoolSelected ? (schoolDetail?.total ?? 0) : point.total;
  const schoolCount = isSchoolSelected ? 1 : point.bySchool.length;

  const countries = isSchoolSelected
    ? (cross && schoolIndex >= 0
        ? cross.rows
            .filter(([s]) => s === schoolIndex)
            .map(([, c, count]) => ({ country: yearly.dict.countries[c] ?? "미상", total: count }))
            .sort((a, b) => b.total - a.total)
        : [])
    : point.byCountry;
  const countryMax = countries[0]?.total || 1;

  const fieldTotals = new Map<string, number>();
  (isSchoolSelected ? schoolDetail?.byField ?? [] : point.byField)
    .forEach(({ field, count }) => fieldTotals.set(field, (fieldTotals.get(field) || 0) + count));
  const fields = [...fieldTotals.entries()].sort((a, b) => b[1] - a[1]);
  const fieldMax = Math.max(...fields.map(([, v]) => v), 1);
  const fieldTotal = fields.reduce((sum, [, v]) => sum + v, 0);

  const programs = isSchoolSelected ? schoolDetail?.byProgram ?? [] : point.byProgram; // 이미 count desc 정렬됨
  const programMax = Math.max(...programs.map((p) => p.count), 1);

  const schools = point.bySchool.filter(({ school: name }) => name.includes(search));
  const visibleSchoolLimit = Math.min(schoolDisplayLimit, schools.length);

  // 전체 유학생 수 추이: 학교 미선택 시 전체, 선택 시 그 학교의 전 연도(2013~2025)
  // 총계/과정별 인원(moe-school-trend.json, 학교 선택 시 1회 지연 로딩).
  const trendSchoolIndex = isSchoolSelected ? schoolTrend?.dict.schools.indexOf(school) ?? -1 : -1;
  const trendSchoolEntry = trendSchoolIndex >= 0 ? schoolTrend?.bySchool[trendSchoolIndex] : undefined;
  const schoolTrendLoading = isSchoolSelected && !schoolTrend && !schoolTrendError;

  const trendPoints = isSchoolSelected
    ? (() => {
        const totalByYear = new Map(trendSchoolEntry?.years.map((y, i) => [y, trendSchoolEntry.total[i]]) ?? []);
        return yearly.years.map((y) => ({ year: y, total: totalByYear.get(y) ?? 0 }));
      })()
    : yearly.series.map((p) => ({ year: p.year, total: p.total }));
  const trendMax = Math.max(...trendPoints.map((p) => p.total), 1);

  const trendProgramRows = isSchoolSelected && trendSchoolEntry
    ? (() => {
        const byYear = new Map(trendSchoolEntry.years.map((y, i) => [y, trendSchoolEntry.byProgram[i]]));
        return yearly.years.map((y) => ({ year: y, values: byYear.get(y) ?? (schoolTrend?.programs.map(() => 0) ?? []) }));
      })()
    : [];

  const reset = () => {
    setSchool(DEFAULT_SCHOOL);
    setSchoolQuery(DEFAULT_SCHOOL_LABEL);
    setSchoolOpen(false);
    setSearch("");
    setSchoolDisplayLimit(10);
    setCountryDetailOpen(false);
  };

  const chooseSchool = (name: string) => {
    setSchool(name);
    setSchoolQuery(name === DEFAULT_SCHOOL ? DEFAULT_SCHOOL_LABEL : name);
    setSchoolOpen(false);
  };

  return (
    <main>
      <section className="hero">
        <div><p className="eyebrow">MINISTRY OF EDUCATION DATA INSIGHT</p><h1>고등교육기관 외국인 유학생 현황</h1><p>교육부·한국교육개발원(KEDI) 연도별 자료로 살펴보는 대한민국 유학생 데이터</p></div>
        <div className="asof"><span>데이터 기준일</span><strong>{year}. 04. 01.</strong><small>교육부·KEDI (연 1회)</small></div>
      </section>

      <section className="filters moe-filters" aria-label="데이터 필터">
        <label className="year-filter">
          <span>기준 연도 · {year}년</span>
          <input
            type="range"
            min={yearly.years[0]}
            max={yearly.years[yearly.years.length - 1]}
            step={1}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="기준 연도"
          />
        </label>
        <label className="school-filter"><span>고등교육기관명</span><div className="school-combobox"><input value={schoolQuery} onFocus={() => setSchoolOpen(true)} onChange={(e) => { setSchoolQuery(e.target.value); setSchool(DEFAULT_SCHOOL); setSchoolOpen(true); }} onKeyDown={(e) => { if (e.key === "Escape") setSchoolOpen(false); }} placeholder="고등교육기관명 검색" aria-label="고등교육기관명 검색" role="combobox" aria-expanded={schoolOpen} aria-controls="moe-school-options-list"/><button type="button" onClick={() => { setSchoolQuery(""); setSchool(DEFAULT_SCHOOL); setSchoolOpen(true); }} aria-label="전체 고등교육기관명 삭제">×</button>{schoolOpen && <div className="school-options" id="moe-school-options-list" role="listbox"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSchool(DEFAULT_SCHOOL)}>{DEFAULT_SCHOOL_LABEL}</button>{schoolSuggestions.map((name) => <button type="button" key={name} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSchool(name)}>{name}</button>)}{schoolSuggestions.length === 0 && <em>검색 결과가 없습니다</em>}</div>}</div></label>
        <button className="reset" onClick={reset}>↻ 초기화</button>
      </section>

      {isSchoolSelected && crossLoading && <p className="trend-loading">{school} 상세 정보를 불러오는 중입니다...</p>}
      {isSchoolSelected && crossError && <p className="trend-error">{school} 상세 정보를 불러오지 못했습니다.</p>}

      <section className="kpis">
        <article><div className="kpi-icon mint"><Icon>人</Icon></div><div><span>전체 유학생</span><strong>{fmt.format(total)}<small>명</small></strong><em>{year}년 4월 1일 기준</em></div></article>
        <article><div className="kpi-icon blue"><Icon>校</Icon></div><div><span>고등교육기관 수</span><strong>{fmt.format(schoolCount)}<small>개</small></strong><em>캠퍼스 합산·학교명 기준</em></div></article>
        <article><div className="kpi-icon orange"><Icon>國</Icon></div><div><span>출신 국가</span><strong>{fmt.format(countries.length)}<small>개국</small></strong><em>국적 분류 기준</em></div></article>
        <article><div className="kpi-icon violet"><Icon>學</Icon></div><div><span>과정 유형</span><strong>{fmt.format(programs.length)}<small>개</small></strong><em>학위·공동운영·연수과정</em></div></article>
      </section>

      <section className="chart-grid">
        <article className="panel wide country-panel"><div className="panel-head"><div><span>국가별 현황</span><h2>주요 출신 국가</h2></div><b>{countryDetailOpen ? `전체 ${fmt.format(countries.length)}개국` : "상위 8개 국가"}</b></div>{countries.length === 0 && isSchoolSelected && !crossLoading ? <p className="empty-course-country">{year}년에는 {school}의 유학생 데이터가 없습니다.</p> : <><div className="bars">{topEntries(countries, countryDetailOpen ? countries.length : 8).map(({ country, total: value }, i) => <div className="bar-row" key={country}><span className="rank">{String(i + 1).padStart(2, "0")}</span><strong>{country}</strong><div className="bar-track"><i style={{ width: `${(value / countryMax) * 100}%` }} /></div><b>{fmt.format(value)}</b><small>{total ? ((value / total) * 100).toFixed(1) : 0}%</small></div>)}</div><button className="country-detail-toggle" type="button" onClick={() => setCountryDetailOpen((v) => !v)} aria-expanded={countryDetailOpen}>{countryDetailOpen ? "전체 국가 접기" : `전체 ${fmt.format(countries.length)}개국 상세보기`}<span aria-hidden="true">{countryDetailOpen ? "⌃" : "⌄"}</span></button></>}</article>
        <article className="panel status-panel"><div className="panel-head"><div><span>전공계열별 현황</span><h2>학위과정 전공계열</h2></div></div><div className="status-list">{fields.map(([name, value], i) => <div key={name}><div><span>{name}</span><b>{fmt.format(value)}명</b></div><div className="status-track"><i className={`c${i}`} style={{ width: `${(value / fieldMax) * 100}%` }} /></div><small>{fieldTotal ? ((value / fieldTotal) * 100).toFixed(1) : 0}%</small></div>)}</div><p className="data-caution">학사·석사·박사 학위과정 인원의 전공계열 합산입니다(연수·공동운영 과정 제외).</p></article>
      </section>

      <section className="chart-grid lower">
        <article className="panel status-panel"><div className="panel-head"><div><span>학위·연수과정별 현황</span><h2>과정 유형</h2></div></div><div className="status-list">{programs.map((p, i) => <div key={p.program}><div><span>{p.program}</span><b>{fmt.format(p.count)}명</b></div><div className="status-track"><i className={`c${i}`} style={{ width: `${(p.count / programMax) * 100}%` }} /></div><small>{total ? ((p.count / total) * 100).toFixed(1) : 0}%</small></div>)}</div></article>
        <article className="panel table-panel"><div className="panel-head table-title"><div><span>고등교육기관별 현황</span><h2>학교명 기준 집계(캠퍼스 합산)</h2><p className="data-caution">시도·시군구가 다른 캠퍼스도 같은 학교명이면 합산했습니다.</p></div><div className="table-tools"><label className="search">⌕<input value={search} onChange={(e) => { setSearch(e.target.value); setSchoolDisplayLimit(10); }} placeholder="고등교육기관명 검색" aria-label="고등교육기관명 검색" /></label></div></div><div className="school-table"><div className="tr th"><span>순위</span><span>고등교육기관명</span><span>유학생 수</span><span>비율</span></div>{schools.slice(0, visibleSchoolLimit).map(({ school: name, total: value }, i) => <div className="tr" key={name}><span>{i + 1}</span><strong>{name}</strong><b>{fmt.format(value)}명</b><span>{point.total ? ((value / point.total) * 100).toFixed(1) : 0}%</span></div>)}</div>{schools.length === 0 && <p className="empty-table">조건에 맞는 고등교육기관이 없습니다.</p>}<div className="rank-actions"><p>{fmt.format(schools.length)}개 고등교육기관 중 {fmt.format(visibleSchoolLimit)}개 표시</p>{visibleSchoolLimit < schools.length && <button className="expand-schools" type="button" onClick={() => setSchoolDisplayLimit((v) => Math.min(v + 30, schools.length))}>다음 30위 펼치기</button>}{visibleSchoolLimit > 10 && <button className="collapse-schools" type="button" onClick={() => setSchoolDisplayLimit(10)}>10위까지만 보기</button>}</div></article>
      </section>

      <section className="chart-grid lower moe-axes">
        <article className="panel"><div className="panel-head"><div><span>지역별 현황</span><h2>시도별 유학생</h2></div></div><div className="bars">{topEntries(point.byRegion, 8).map(({ region, total: value }, i) => <div className="bar-row" key={region}><span className="rank">{String(i + 1).padStart(2, "0")}</span><strong>{region}</strong><div className="bar-track"><i style={{ width: `${(value / (point.byRegion[0]?.total || 1)) * 100}%` }} /></div><b>{fmt.format(value)}</b><small>{point.total ? ((value / point.total) * 100).toFixed(1) : 0}%</small></div>)}</div></article>
        <article className="panel"><div className="panel-head"><div><span>설립별 현황</span><h2>국립·공립·사립</h2></div></div><div className="bars">{point.byFounding.map(({ founding, total: value }, i) => <div className="bar-row" key={founding}><span className="rank">{String(i + 1).padStart(2, "0")}</span><strong>{founding}</strong><div className="bar-track"><i style={{ width: `${(value / (point.byFounding[0]?.total || 1)) * 100}%` }} /></div><b>{fmt.format(value)}</b><small>{point.total ? ((value / point.total) * 100).toFixed(1) : 0}%</small></div>)}</div></article>
        <article className="panel"><div className="panel-head"><div><span>학제별 현황</span><h2>대학교·전문대학·대학원</h2></div></div><div className="bars">{topEntries(point.bySchoolType, 8).map(({ type, total: value }, i) => <div className="bar-row" key={type}><span className="rank">{String(i + 1).padStart(2, "0")}</span><strong>{type}</strong><div className="bar-track"><i style={{ width: `${(value / (point.bySchoolType[0]?.total || 1)) * 100}%` }} /></div><b>{fmt.format(value)}</b><small>{point.total ? ((value / point.total) * 100).toFixed(1) : 0}%</small></div>)}</div></article>
      </section>

      <section className="trend-section">
        <article className="panel trend-panel">
          <div className="panel-head"><div><span>시계열 변동</span><h2>{isSchoolSelected ? `${school} 유학생 수 추이 (${yearly.years[0]}~${yearly.years[yearly.years.length - 1]})` : `전체 유학생 수 추이 (${yearly.years[0]}~${yearly.years[yearly.years.length - 1]})`}</h2><p className="trend-note">교육부·KEDI 매년 4월 1일 기준 자료. 법무부 반기 통계와 집계 시점·기준이 달라 상단 KPI와 직접 비교할 수 없습니다.</p></div><b>{fmt.format(trendPoints[trendPoints.length - 1]?.total ?? 0)}<small>명 ({trendPoints[trendPoints.length - 1]?.year}년)</small></b></div>
          {isSchoolSelected && schoolTrendLoading ? <p className="trend-loading">추이 데이터를 불러오는 중입니다...</p> : isSchoolSelected && schoolTrendError ? <p className="trend-error">추이 데이터를 불러오지 못했습니다.</p> : (
            <>
              <div className="trend-chart">
                {trendPoints.map((p) => <div className="trend-col" key={p.year}><div className="trend-bar-wrap"><div className="trend-val">{fmt.format(p.total)}</div><i className={`trend-bar ${p.year === year ? "h1" : "moe"}`} style={{ height: `${(p.total / trendMax) * 100}%` }} title={`${p.year}년: ${p.total}명`} /></div><span>{p.year}</span></div>)}
              </div>
              <div className="trend-legend"><span><i className="h1" />선택한 연도({year})</span><span><i className="moe" />그 외 연도</span></div>
              {isSchoolSelected && trendProgramRows.length > 0 && (
                <div className="trend-breakdown">
                  <h3>과정별 변동</h3>
                  <table className="trend-table"><thead><tr><th>기준연도</th>{(schoolTrend?.programs ?? []).map((p) => <th key={p}>{p}</th>)}</tr></thead><tbody>{trendProgramRows.map((row) => <tr key={row.year}><td>{row.year}</td>{row.values.map((v, i) => <td key={i}>{fmt.format(v)}</td>)}</tr>)}</tbody></table>
                </div>
              )}
            </>
          )}
        </article>
      </section>

      <footer><span>DATA SOURCE · 교육부·한국교육개발원(KEDI) 고등교육기관 외국인 유학생 현황</span><p>매년 4월 1일 기준으로 발표되는 공공데이터를 집계한 것으로, 행정 목적의 공식 통계와 차이가 있을 수 있습니다.</p><b>{year}년 원자료 총 {fmt.format(point.total)}건</b></footer>
    </main>
  );
}
