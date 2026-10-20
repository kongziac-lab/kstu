"use client";

import { useEffect, useMemo, useState } from "react";
import { getMoeCertification, prioritizeKeimyung } from "../lib/school-names";
import type { MoeCross, MoeSchoolTrend, MoeYearly, MoeYearPoint } from "../lib/types";
import { useLang } from "../lib/lang-context";
import { countryName, fieldName, foundingName, programName, regionName, schoolName, schoolTypeName } from "../lib/value-names";

const fmt = new Intl.NumberFormat("ko-KR");
const DEFAULT_SCHOOL = "전체 기관명";
// scripts/sync-moe-data.mjs의 PROGRAM_ORDER와 동일한 순서/표기. 생성된 JSON에 이
// 이름 그대로 실리므로 조회 키로만 쓰고 화면에는 노출하지 않는다(원본 엑셀 헤더
// "학위과정>대학·전문대학>계"에 묶여 있어 이름을 바꾸면 파싱이 깨진다).
const PROGRAM_SOURCE_ORDER = ["대학·전문대학", "석사과정", "박사과정", "공동운영", "연수과정"];
// 화면에 보여줄 이름. 첫 항목은 학사·전문학사 학위과정을 묶은 것이라 그렇게 표기한다.
const PROGRAM_ORDER = ["학사·전문학사", "석사과정", "박사과정", "공동운영", "연수과정"];
/** moe-yearly.json 등에 실린 원본 과정명을 화면 표기로 바꾼다. */
function programLabel(sourceName: string) {
  const i = PROGRAM_SOURCE_ORDER.indexOf(sourceName);
  return i >= 0 ? PROGRAM_ORDER[i] : sourceName;
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function topEntries<T extends { total: number } | { count: number }>(items: T[], limit: number) {
  return items.slice(0, limit);
}

/** 교육부/KEDI 고등교육기관 외국인 유학생 현황(연 1회 4월 1일 기준, 2013~2025) 대시보드 본문. */
export default function MoeBody() {
  const { lang, t } = useLang();
  const DEFAULT_SCHOOL_LABEL = t.allSchools;
  const cn = (v: string) => countryName(v, lang);
  const pn = (v: string) => programName(v, lang);
  const [yearly, setYearly] = useState<MoeYearly | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [year, setYear] = useState<number | null>(null);
  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [schoolQuery, setSchoolQuery] = useState(DEFAULT_SCHOOL_LABEL);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [country, setCountry] = useState("전체 국가");
  const [courseFilter, setCourseFilter] = useState("전체 과정");
  const [search, setSearch] = useState("");
  const [schoolDisplayLimit, setSchoolDisplayLimit] = useState(10);
  const [countryDetailOpen, setCountryDetailOpen] = useState(false);
  const [certificationView, setCertificationView] = useState("전체 인증");
  const [openVariants, setOpenVariants] = useState<string[]>([]);
  // 시계열 그래프가 무엇을 보여줄지. null이면 전체 합계, 아니면 특정 과정/국가 하나.
  const [trendView, setTrendView] = useState<{ kind: "program" | "country"; name: string } | null>(null);
  // 과정별/국가별 변동 표는 기본적으로 최근 연도 한 줄만 펼쳐 둔다.
  const [programRowsOpen, setProgramRowsOpen] = useState(false);
  const [countryRowsOpen, setCountryRowsOpen] = useState(false);
  // 국가별 변동 표에서 특정 연도x국가 칸을 클릭하면 그 조합의 과정별 인원을 표 아래에 보여준다.
  const [cellBreakdown, setCellBreakdown] = useState<{ year: number; country: string } | null>(null);
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
      .catch(() => setLoadError(t.loadFail));
    return () => controller.abort();
  }, [loadAttempt, t.loadFail]);

  const point: MoeYearPoint | null = useMemo(() => {
    if (!yearly || year == null) return null;
    return yearly.series.find((p) => p.year === year) ?? null;
  }, [yearly, year]);

  // 연도의 학교x국가 교차표(+ 학교별 상세: 원본 표기 병합 내역·과정별 인원)를 지연
  // 로딩한다. 고등교육기관별 순위표의 "원본 내역 보기"도 이 데이터가 있어야 하므로
  // 학교를 검색해 선택했는지와 무관하게, 보고 있는 연도가 바뀔 때마다 받아온다.
  useEffect(() => {
    if (year == null || crossByYear[year] || crossErrorYears[year]) return;
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
  }, [year, crossByYear, crossErrorYears]);

  const cross = year != null ? crossByYear[year] : undefined;
  const crossError = year != null ? Boolean(crossErrorYears[year]) : false;
  // KPI·국가별·과정유형별·순위표가 모두 cross(학교x국가x과정 3중 데이터)를
  // 기준으로 계산되므로, 학교 선택 여부와 무관하게 연도 전환마다 이 로딩 상태를 거친다.
  const crossLoading = year != null && !cross && !crossError;

  // "국가별 변동" 표는 13개 연도를 한 번에 보여주지만 학교x국가x과정 교차표는
  // 보고 있는 연도 하나만 지연 로딩되어 있다. 표에서 다른 연도의 칸을 클릭하면
  // 그 연도의 교차표도 같은 캐시(crossByYear)에 추가로 받아온다.
  const loadCrossYear = (y: number) => {
    if (crossByYear[y] || crossErrorYears[y]) return;
    fetch(`/moe-cross-${y}.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`cross 요청 실패: ${response.status}`);
        return response.json() as Promise<MoeCross>;
      })
      .then((data) => setCrossByYear((prev) => ({ ...prev, [y]: data })))
      .catch(() => setCrossErrorYears((prev) => ({ ...prev, [y]: true })));
  };

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
    return <main className="loading"><p>{loadError}</p><button type="button" onClick={() => { setLoadError(null); setLoadAttempt((v) => v + 1); }}>{t.retry}</button></main>;
  }
  if (!yearly || !point || year == null) {
    return <main className="loading"><div className="loader" /><p>{t.loadingMoe}</p></main>;
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

  // 법무부와 동일한 방식: 학교·국가·과정 유형 세 필터가 모두 AND로 결합되어
  // KPI·국가별·과정유형별·순위표에 반영된다. cross.rows가 이미 학교x국가x과정
  // 3중 조합을 담고 있어(학교idx,국가idx,총계,과정 5개) 별도 조인 없이 필터링한다.
  // cross가 아직 로딩 전이면(연도 전환 직후) point/schoolDetail의 무필터 값으로
  // 잠깐 대체해 보여주다가, cross가 도착하면 동일한 값으로 자연스럽게 수렴한다.
  const isSchoolSelected = school !== DEFAULT_SCHOOL;
  const schoolIndex = isSchoolSelected ? yearly.dict.schools.indexOf(school) : -1;
  const schoolDetail = isSchoolSelected && cross && schoolIndex >= 0 ? cross.schools[schoolIndex] : undefined;
  const countryIndexSelected = country !== "전체 국가" ? yearly.dict.countries.indexOf(country) : -1;
  const programIndexSelected = courseFilter !== "전체 과정" ? PROGRAM_ORDER.indexOf(courseFilter) : -1;
  const filtersActive = countryIndexSelected >= 0 || programIndexSelected >= 0;

  const rowProgramValue = (row: MoeCross["rows"][number]) =>
    programIndexSelected >= 0 ? row[3 + programIndexSelected] : row[2];

  // 선택된 학교(있다면) + 선택된 국가에 해당하는 행만 남긴다. 과정 유형 선택은
  // "어느 열을 합산할지"만 바꾸므로 행 자체는 거르지 않는다(rowProgramValue가 처리).
  const filteredCrossRows = cross
    ? cross.rows.filter((row) =>
        (!isSchoolSelected || row[0] === schoolIndex) &&
        (countryIndexSelected < 0 || row[1] === countryIndexSelected)
      )
    : [];

  const total = cross
    ? filteredCrossRows.reduce((sum, row) => sum + rowProgramValue(row), 0)
    : (isSchoolSelected ? (schoolDetail?.total ?? 0) : point.total);

  const schoolCount = cross
    ? new Set(filteredCrossRows.filter((row) => rowProgramValue(row) > 0).map((row) => row[0])).size
    : (isSchoolSelected ? 1 : point.bySchool.length);

  const countries = cross
    ? (() => {
        const map = new Map<string, number>();
        filteredCrossRows.forEach((row) => {
          const v = rowProgramValue(row);
          if (v <= 0) return;
          const name = yearly.dict.countries[row[1]] ?? "미상";
          map.set(name, (map.get(name) || 0) + v);
        });
        return [...map.entries()].map(([country, total]) => ({ country, total })).sort((a, b) => b.total - a.total);
      })()
    : (isSchoolSelected ? [] : point.byCountry);
  const countryMax = countries[0]?.total || 1;

  // 전공계열별 현황은 학교별 상세(byField)에만 있고 국가·과정 유형별로는 쪼개져
  // 있지 않으므로(원본 시트 구조상 국가별x과정별x전공계열별 4중 조합은 없음),
  // 국가·과정 필터는 적용하지 않고 기존처럼 학교 선택 여부만 반영한다.
  const fieldTotals = new Map<string, number>();
  (isSchoolSelected ? schoolDetail?.byField ?? [] : point.byField)
    .forEach(({ field, count }) => fieldTotals.set(field, (fieldTotals.get(field) || 0) + count));
  const fields = [...fieldTotals.entries()].sort((a, b) => b[1] - a[1]);
  const fieldMax = Math.max(...fields.map(([, v]) => v), 1);
  const fieldTotal = fields.reduce((sum, [, v]) => sum + v, 0);

  const programs = cross
    ? (() => {
        const map = new Map<string, number>();
        filteredCrossRows.forEach((row) => {
          PROGRAM_ORDER.forEach((name, i) => {
            if (programIndexSelected >= 0 && i !== programIndexSelected) return;
            const v = row[3 + i];
            if (v <= 0) return;
            map.set(name, (map.get(name) || 0) + v);
          });
        });
        return [...map.entries()].map(([program, count]) => ({ program, count })).sort((a, b) => b.count - a.count);
      })()
    : (isSchoolSelected ? schoolDetail?.byProgram ?? [] : point.byProgram)
        .map(({ program, count }) => ({ program: programLabel(program), count }));
  const programMax = Math.max(...programs.map((p) => p.count), 1);

  // 순위표는 국가·과정 필터만 반영하고(학교 필터는 걸지 않음 — 전체 학교를 줄 세워야 하므로),
  // 필터가 없을 때는 point.bySchool과 값이 같아야 한다(같은 원본을 다른 시트에서 집계한 것이므로).
  const schoolRankTotals = cross && filtersActive
    ? (() => {
        const rows = countryIndexSelected < 0 ? cross.rows : cross.rows.filter((row) => row[1] === countryIndexSelected);
        const map = new Map<number, number>();
        rows.forEach((row) => {
          const v = rowProgramValue(row);
          if (v <= 0) return;
          map.set(row[0], (map.get(row[0]) || 0) + v);
        });
        return [...map.entries()]
          .map(([idx, total]) => ({ school: yearly.dict.schools[idx] ?? "미상", total }))
          .sort((a, b) => b.total - a.total);
      })()
    : point.bySchool;

  const schools = schoolRankTotals.filter(({ school: name }) => {
    const certification = getMoeCertification(name, year);
    return name.includes(search) &&
      (certificationView === "전체 인증" ||
        certification === certificationView ||
        (certificationView === "미표기" && !certification));
  });
  const visibleSchoolLimit = Math.min(schoolDisplayLimit, schools.length);
  const rankTotal = filtersActive ? schoolRankTotals.reduce((sum, s) => sum + s.total, 0) : point.total;

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

  // 과정별 변동: 학교 미선택 시 전체(moe-yearly.json, 이미 로드됨) 기준, 선택 시
  // 그 학교(moe-school-trend.json) 기준. 두 경우 모두 PROGRAM_ORDER 순서로 정렬한다.
  const trendProgramRows = isSchoolSelected
    ? (trendSchoolEntry
        ? (() => {
            const byYear = new Map(trendSchoolEntry.years.map((y, i) => [y, trendSchoolEntry.byProgram[i]]));
            return yearly.years.map((y) => ({ year: y, values: byYear.get(y) ?? PROGRAM_ORDER.map(() => 0) }));
          })()
        : [])
    : yearly.series.map((p) => ({
        year: p.year,
        values: PROGRAM_SOURCE_ORDER.map((name) => p.byProgram.find((x) => x.program === name)?.count ?? 0),
      }));

  // 국가별 변동: 과정별과 같은 두 갈래 구조. 전체 연도에 걸쳐 인원이 많은 상위
  // 8개국(미상 제외)만 열로 뽑는다(법무부 국가별 변동 표와 동일한 방식).
  const trendCountrySeries = isSchoolSelected
    ? (trendSchoolEntry
        ? trendSchoolEntry.years.map((y, i) => ({
            year: y,
            countries: trendSchoolEntry.byCountry[i].map(([cIdx, count]) => ({
              name: yearly.dict.countries[cIdx] ?? "미상",
              count,
            })),
          }))
        : [])
    : yearly.series.map((p) => ({
        year: p.year,
        countries: p.byCountry.map((c) => ({ name: c.country, count: c.total })),
      }));

  const trendCountryColumns = (() => {
    const totals = new Map<string, number>();
    trendCountrySeries.forEach((row) => row.countries.forEach(({ name, count }) => {
      if (name === "미상") return;
      totals.set(name, (totals.get(name) || 0) + count);
    }));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
  })();

  const trendCountryRows = (() => {
    const byYear = new Map(trendCountrySeries.map((row) => [row.year, row.countries]));
    return yearly.years.map((y) => {
      const byName = new Map((byYear.get(y) ?? []).map((c) => [c.name, c.count]));
      return { year: y, values: trendCountryColumns.map((name) => byName.get(name) ?? 0) };
    });
  })();

  // 위쪽 시계열 그래프는 한 자리만 차지하고, 과정별/국가별 변동 표의 열 이름을
  // 클릭할 때마다 그 항목만 보여준다. "기준연도"를 누르면 전체 합계로 돌아온다.
  const chartPoints = (() => {
    if (trendView?.kind === "program") {
      const i = PROGRAM_ORDER.indexOf(trendView.name);
      if (i >= 0) return trendProgramRows.map((row) => ({ year: row.year, total: row.values[i] ?? 0 }));
    }
    if (trendView?.kind === "country") {
      const i = trendCountryColumns.indexOf(trendView.name);
      if (i >= 0) return trendCountryRows.map((row) => ({ year: row.year, total: row.values[i] ?? 0 }));
    }
    return trendPoints;
  })();
  const chartMax = Math.max(...chartPoints.map((p) => p.total), 1);
  const chartSubject = isSchoolSelected || trendView ? `${isSchoolSelected ? school : t.total}${trendView ? ` · ${trendView.kind === "program" ? pn(trendView.name) : cn(trendView.name)}` : ""}` : null;
  const chartTitle = t.trendTitleMoe(chartSubject, yearly.years[0], yearly.years[yearly.years.length - 1]);

  // 표는 최근 연도가 맨 위에 오도록 뒤집고, 접힌 상태에서는 최근 연도 한 줄만 보인다.
  const descProgramRows = [...trendProgramRows].reverse();
  const descCountryRows = [...trendCountryRows].reverse();
  const visibleProgramRows = programRowsOpen ? descProgramRows : descProgramRows.slice(0, 1);
  const visibleCountryRows = countryRowsOpen ? descCountryRows : descCountryRows.slice(0, 1);

  const chooseCountryCell = (y: number, country: string) => {
    setCellBreakdown((cur) => (cur && cur.year === y && cur.country === country ? null : { year: y, country }));
    loadCrossYear(y);
  };

  // 국가별 변동 표에서 클릭한 연도x국가 칸의 과정별 인원. moe-cross-{연도}.json의
  // 학교x국가x과정 행에서 그 국가(및 학교 선택 시 그 학교)에 해당하는 행만 모아
  // 과정별 열을 합산한다 — moe-yearly.json에는 국가x과정 교차 데이터가 없어서
  // 이 표에 쓰인 연도별 cross 파일을 다시 조회해야 한다.
  const cellCross = cellBreakdown ? crossByYear[cellBreakdown.year] : undefined;
  const cellCrossError = cellBreakdown ? Boolean(crossErrorYears[cellBreakdown.year]) : false;
  const cellCountryIndex = cellBreakdown ? yearly.dict.countries.indexOf(cellBreakdown.country) : -1;
  const cellBreakdownValues = cellCross && cellCountryIndex >= 0
    ? PROGRAM_SOURCE_ORDER.map((_, i) => cellCross.rows
        .filter((row) => (!isSchoolSelected || row[0] === schoolIndex) && row[1] === cellCountryIndex)
        .reduce((sum, row) => sum + row[3 + i], 0))
    : null;
  const cellBreakdownTotal = cellBreakdownValues ? cellBreakdownValues.reduce((a, b) => a + b, 0) : 0;

  const reset = () => {
    setSchool(DEFAULT_SCHOOL);
    setSchoolQuery(DEFAULT_SCHOOL_LABEL);
    setSchoolOpen(false);
    setCountry("전체 국가");
    setCourseFilter("전체 과정");
    setSearch("");
    setSchoolDisplayLimit(10);
    setCountryDetailOpen(false);
    setCertificationView("전체 인증");
    setOpenVariants([]);
    setTrendView(null);
    setProgramRowsOpen(false);
    setCountryRowsOpen(false);
    setCellBreakdown(null);
  };

  const chooseSchool = (name: string) => {
    setSchool(name);
    setSchoolQuery(name === DEFAULT_SCHOOL ? DEFAULT_SCHOOL_LABEL : name);
    setSchoolOpen(false);
  };

  const toggleVariants = (name: string) => {
    setOpenVariants((items) => items.includes(name) ? items.filter((v) => v !== name) : [...items, name]);
  };

  return (
    <main>
      <section className="hero">
        <div><p className="eyebrow">MINISTRY OF EDUCATION DATA INSIGHT</p><h1>{t.heroTitleMoe}</h1><p>{t.heroDescMoe}</p></div>
        <div className="asof"><span>{t.asOfLabel}</span><strong>{t.asOfDateMoe(year)}</strong><small>{t.asOfSourceMoe}</small></div>
      </section>

      <section className="filters moe-filters" aria-label={t.filtersAria}>
        <label className="year-filter">
          <span>{t.yearLabel(year)}</span>
          <input
            type="range"
            min={yearly.years[0]}
            max={yearly.years[yearly.years.length - 1]}
            step={1}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label={t.yearAria}
          />
        </label>
        <label className="school-filter"><span>{t.school}</span><div className="school-combobox"><input value={schoolQuery} onFocus={() => setSchoolOpen(true)} onChange={(e) => { setSchoolQuery(e.target.value); setSchool(DEFAULT_SCHOOL); setSchoolOpen(true); }} onKeyDown={(e) => { if (e.key === "Escape") setSchoolOpen(false); }} placeholder={t.schoolSearch} aria-label={t.schoolSearch} role="combobox" aria-expanded={schoolOpen} aria-controls="moe-school-options-list"/><button type="button" onClick={() => { setSchoolQuery(""); setSchool(DEFAULT_SCHOOL); setSchoolOpen(true); }} aria-label={t.clearSchool}>×</button>{schoolOpen && <div className="school-options" id="moe-school-options-list" role="listbox"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSchool(DEFAULT_SCHOOL)}>{DEFAULT_SCHOOL_LABEL}</button>{schoolSuggestions.map((name) => <button type="button" key={name} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSchool(name)}>{name}</button>)}{schoolSuggestions.length === 0 && <em>{t.noResults}</em>}</div>}</div></label>
        <label><span>{t.country}</span><select aria-label={t.country} value={country} onChange={(e) => setCountry(e.target.value)}><option value="전체 국가">{t.allCountries}</option>{point.byCountry.map(({ country: v }) => <option key={v} value={v}>{cn(v)}</option>)}</select></label>
        <label><span>{t.programType}</span><select aria-label={t.programType} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}><option value="전체 과정">{t.allPrograms}</option>{PROGRAM_ORDER.map((v) => <option key={v} value={v}>{pn(v)}</option>)}</select></label>
        <button className="reset" onClick={reset}>{t.reset}</button>
      </section>

      {crossLoading && <p className="trend-loading">{t.crossLoading(isSchoolSelected ? school : null)}</p>}
      {crossError && <p className="trend-error">{t.crossError(isSchoolSelected ? school : null)}</p>}

      <section className="kpis">
        <article><div className="kpi-icon mint"><Icon>人</Icon></div><div><span>{t.kpiStudents}</span><strong>{fmt.format(total)}<small>{t.unitPeople}</small></strong><em>{t.kpiStudentsNoteMoe(year)}</em></div></article>
        <article><div className="kpi-icon blue"><Icon>校</Icon></div><div><span>{t.kpiSchools}</span><strong>{fmt.format(schoolCount)}<small>{t.unitCount}</small></strong><em>{t.kpiSchoolsNoteMoe}</em></div></article>
        <article><div className="kpi-icon orange"><Icon>國</Icon></div><div><span>{t.kpiCountries}</span><strong>{fmt.format(countries.length)}<small>{t.unitCountries}</small></strong><em>{t.kpiCountriesNote}</em></div></article>
        <article><div className="kpi-icon violet"><Icon>學</Icon></div><div><span>{t.kpiPrograms}</span><strong>{fmt.format(programs.length)}<small>{t.unitCount}</small></strong><em>{t.kpiProgramsNote}</em></div></article>
      </section>

      <section className="chart-grid">
        <article className="panel wide country-panel"><div className="panel-head"><div><span>{t.countryEyebrow}</span><h2>{t.countryTitle}</h2></div><b>{countryDetailOpen ? t.allN(fmt.format(countries.length)) : t.top8}</b></div>{countries.length === 0 && isSchoolSelected && !crossLoading ? <p className="empty-course-country">{t.noSchoolData(year, school)}</p> : <><div className="bars">{topEntries(countries, countryDetailOpen ? countries.length : 8).map(({ country, total: value }, i) => <div className="bar-row" key={country}><span className="rank">{String(i + 1).padStart(2, "0")}</span><strong>{cn(country)}</strong><div className="bar-track"><i style={{ width: `${(value / countryMax) * 100}%` }} /></div><b>{fmt.format(value)}</b><small>{total ? ((value / total) * 100).toFixed(1) : 0}%</small></div>)}</div><button className="country-detail-toggle" type="button" onClick={() => setCountryDetailOpen((v) => !v)} aria-expanded={countryDetailOpen}>{countryDetailOpen ? t.collapseCountries : t.showAllCountries(fmt.format(countries.length))}<span aria-hidden="true">{countryDetailOpen ? "⌃" : "⌄"}</span></button></>}</article>
        <article className="panel status-panel"><div className="panel-head"><div><span>{t.fieldEyebrow}</span><h2>{t.fieldTitle}</h2></div></div><div className="status-list">{fields.map(([name, value], i) => <div key={name}><div><span>{fieldName(name, lang)}</span><b>{t.ppl(fmt.format(value))}</b></div><div className="status-track"><i className={`c${i}`} style={{ width: `${(value / fieldMax) * 100}%` }} /></div><small>{fieldTotal ? ((value / fieldTotal) * 100).toFixed(1) : 0}%</small></div>)}</div><p className="data-caution">{t.fieldNote}</p></article>
      </section>

      <section className="chart-grid lower">
        <article className="panel status-panel"><div className="panel-head"><div><span>{t.programEyebrow}</span><h2>{t.programTitle}</h2></div></div><div className="status-list">{programs.map((p, i) => <div key={p.program}><div><span>{pn(p.program)}</span><b>{t.ppl(fmt.format(p.count))}</b></div><div className="status-track"><i className={`c${i}`} style={{ width: `${(p.count / programMax) * 100}%` }} /></div><small>{total ? ((p.count / total) * 100).toFixed(1) : 0}%</small></div>)}</div></article>
        <article className="panel table-panel"><div className="panel-head table-title"><div><span>{t.schoolEyebrow}</span><h2>{t.schoolTitleMoe}</h2><p className="data-caution">{t.schoolNoteMoe(year)}</p>{t.schoolNameNote && <p className="school-name-note">{t.schoolNameNote}</p>}</div><div className="table-tools"><label className="cert-filter"><span>{t.certView}</span><select value={certificationView} onChange={(e) => { setCertificationView(e.target.value); setSchoolDisplayLimit(10); setOpenVariants([]); }} aria-label={t.certAria}><option value="전체 인증">{t.certAll}</option><option value="우수">{t.certExcellent}</option><option value="미표기">{t.certNone}</option></select></label><label className="search">⌕<input value={search} onChange={(e) => { setSearch(e.target.value); setSchoolDisplayLimit(10); setOpenVariants([]); }} placeholder={t.schoolSearch} aria-label={t.schoolSearch} /></label></div></div><div className="school-table"><div className="tr th"><span>{t.thRank}</span><span>{t.thSchool}</span><span>{t.thStudents}</span><span>{t.thShare}</span></div>{schools.slice(0, visibleSchoolLimit).map(({ school: name, total: value }, i) => { const certification = getMoeCertification(name, year); const nameIndex = yearly.dict.schools.indexOf(name); const variants = cross && nameIndex >= 0 ? cross.schools[nameIndex]?.variants : undefined; const variantsOpen = openVariants.includes(name); return <div className="school-row-group" key={name}><div className="tr"><span>{i + 1}</span><strong>{schoolName(name, lang)}{certification && <em className="cert-badge excellent">{t.certBadge(certification as "우수" | "일반")}</em>}{variants && variants.length > 1 && <button className="variant-toggle" type="button" onClick={() => toggleVariants(name)} aria-expanded={variantsOpen}>{variantsOpen ? t.variantsHide : t.variantsShow(variants.length)}<span>{variantsOpen ? "⌃" : "⌄"}</span></button>}</strong><b>{t.ppl(fmt.format(value))}</b><span>{rankTotal ? ((value / rankTotal) * 100).toFixed(1) : 0}%</span></div>{variantsOpen && variants && <div className="variant-list">{variants.map((variant) => <div key={variant.name}><span>{variant.name}</span><b>{t.ppl(fmt.format(variant.total))}</b><small>{value ? ((variant.total / value) * 100).toFixed(1) : 0}%</small></div>)}</div>}</div>; })}</div>{schools.length === 0 && <p className="empty-table">{t.noSchools}</p>}<div className="rank-actions"><p>{t.showingOf(fmt.format(schools.length), fmt.format(visibleSchoolLimit))}</p>{visibleSchoolLimit < schools.length && <button className="expand-schools" type="button" onClick={() => setSchoolDisplayLimit((v) => Math.min(v + 30, schools.length))}>{t.next30}</button>}{visibleSchoolLimit > 10 && <button className="collapse-schools" type="button" onClick={() => setSchoolDisplayLimit(10)}>{t.top10Only}</button>}</div></article>
      </section>

      <section className="chart-grid lower moe-axes">
        <article className="panel"><div className="panel-head"><div><span>{t.regionEyebrow}</span><h2>{t.regionTitle}</h2></div></div><div className="bars">{topEntries(point.byRegion, 8).map(({ region, total: value }, i) => <div className="bar-row" key={region}><span className="rank">{String(i + 1).padStart(2, "0")}</span><strong>{regionName(region, lang)}</strong><div className="bar-track"><i style={{ width: `${(value / (point.byRegion[0]?.total || 1)) * 100}%` }} /></div><b>{fmt.format(value)}</b><small>{point.total ? ((value / point.total) * 100).toFixed(1) : 0}%</small></div>)}</div></article>
        <article className="panel"><div className="panel-head"><div><span>{t.foundingEyebrow}</span><h2>{t.foundingTitle}</h2></div></div><div className="bars">{point.byFounding.map(({ founding, total: value }, i) => <div className="bar-row" key={founding}><span className="rank">{String(i + 1).padStart(2, "0")}</span><strong>{foundingName(founding, lang)}</strong><div className="bar-track"><i style={{ width: `${(value / (point.byFounding[0]?.total || 1)) * 100}%` }} /></div><b>{fmt.format(value)}</b><small>{point.total ? ((value / point.total) * 100).toFixed(1) : 0}%</small></div>)}</div></article>
        <article className="panel"><div className="panel-head"><div><span>{t.typeEyebrow}</span><h2>{t.typeTitle}</h2></div></div><div className="bars">{topEntries(point.bySchoolType, 8).map(({ type, total: value }, i) => <div className="bar-row" key={type}><span className="rank">{String(i + 1).padStart(2, "0")}</span><strong>{schoolTypeName(type, lang)}</strong><div className="bar-track"><i style={{ width: `${(value / (point.bySchoolType[0]?.total || 1)) * 100}%` }} /></div><b>{fmt.format(value)}</b><small>{point.total ? ((value / point.total) * 100).toFixed(1) : 0}%</small></div>)}</div></article>
      </section>

      <section className="trend-section">
        <article className="panel trend-panel">
          <div className="panel-head"><div><span>{t.trendEyebrow}</span><h2>{chartTitle}</h2><p className="trend-note">{t.trendNoteMoe}</p></div><b>{fmt.format(chartPoints[chartPoints.length - 1]?.total ?? 0)}<small>{t.latestYear(chartPoints[chartPoints.length - 1]?.year)}</small></b></div>
          {isSchoolSelected && schoolTrendLoading ? <p className="trend-loading">{t.trendDataLoading}</p> : isSchoolSelected && schoolTrendError ? <p className="trend-error">{t.trendDataError}</p> : (
            <>
              <div className="trend-chart">
                {chartPoints.map((p) => <div className="trend-col" key={p.year}><div className="trend-bar-wrap"><div className="trend-val">{fmt.format(p.total)}</div><i className={`trend-bar ${p.year === year ? "h1" : "moe"}`} style={{ height: `${(p.total / chartMax) * 100}%` }} title={`${p.year}: ${t.ppl(fmt.format(p.total))}`} /></div><span>{p.year}</span></div>)}
              </div>
              <div className="trend-legend"><span><i className="h1" />{t.legendSelected(year)}</span><span><i className="moe" />{t.legendOther}</span></div>
              {trendProgramRows.length > 0 && (
                <div className="trend-breakdown">
                  <h3>{t.programChange}</h3>
                  <p className="trend-note">{t.programChangeNote}</p>
                  <table className="trend-table"><thead><tr><th><button type="button" className={trendView === null ? "active" : ""} aria-pressed={trendView === null} onClick={() => setTrendView(null)}>{t.baseYear}</button></th>{PROGRAM_ORDER.map((p) => { const on = trendView?.kind === "program" && trendView.name === p; return <th key={p}><button type="button" className={on ? "active" : ""} aria-pressed={on} onClick={() => setTrendView(on ? null : { kind: "program", name: p })}>{pn(p)}</button></th>; })}</tr></thead><tbody>{visibleProgramRows.map((row) => <tr key={row.year}><td>{row.year}</td>{row.values.map((v, i) => <td key={i}>{fmt.format(v)}</td>)}</tr>)}</tbody></table>
                  {descProgramRows.length > 1 && <button className="trend-rows-toggle" type="button" aria-expanded={programRowsOpen} onClick={() => setProgramRowsOpen((v) => !v)}>{programRowsOpen ? t.collapseRows : t.expandRows(descProgramRows.length - 1)}<span aria-hidden="true">{programRowsOpen ? "⌃" : "⌄"}</span></button>}
                </div>
              )}
              {trendCountryColumns.length > 0 && (
                <div className="trend-breakdown">
                  <h3>{t.countryChangeMoe(trendCountryColumns.length)}</h3>
                  <p className="trend-note">{t.countryChangeNote}</p>
                  <table className="trend-table"><thead><tr><th><button type="button" className={trendView === null ? "active" : ""} aria-pressed={trendView === null} onClick={() => setTrendView(null)}>{t.baseYear}</button></th>{trendCountryColumns.map((c) => { const on = trendView?.kind === "country" && trendView.name === c; return <th key={c}><button type="button" className={on ? "active" : ""} aria-pressed={on} onClick={() => setTrendView(on ? null : { kind: "country", name: c })}>{cn(c)}</button></th>; })}</tr></thead><tbody>{visibleCountryRows.map((row) => <tr key={row.year}><td>{row.year}</td>{row.values.map((v, i) => { const country = trendCountryColumns[i]; const on = cellBreakdown?.year === row.year && cellBreakdown?.country === country; return <td key={i}><button type="button" className={`cell-value${on ? " active" : ""}`} onClick={() => chooseCountryCell(row.year, country)}>{fmt.format(v)}</button></td>; })}</tr>)}</tbody></table>
                  {descCountryRows.length > 1 && <button className="trend-rows-toggle" type="button" aria-expanded={countryRowsOpen} onClick={() => setCountryRowsOpen((v) => !v)}>{countryRowsOpen ? t.collapseRows : t.expandRows(descCountryRows.length - 1)}<span aria-hidden="true">{countryRowsOpen ? "⌃" : "⌄"}</span></button>}
                  {cellBreakdown && (
                    <div className="cell-breakdown">
                      <h4>{t.cellTitle(cellBreakdown.year, cn(cellBreakdown.country), isSchoolSelected ? school : null)}</h4>
                      {!cellCross && !cellCrossError && <p className="trend-loading">{t.loadingShort}</p>}
                      {cellCrossError && <p className="trend-error">{t.errorShort}</p>}
                      {cellBreakdownValues && (
                        <table className="trend-table cell-breakdown-table"><thead><tr>{PROGRAM_ORDER.map((p) => <th key={p}>{pn(p)}</th>)}<th>{t.sum}</th></tr></thead><tbody><tr>{cellBreakdownValues.map((v, i) => <td key={i}>{t.ppl(fmt.format(v))}</td>)}<td><b>{t.ppl(fmt.format(cellBreakdownTotal))}</b></td></tr></tbody></table>
                      )}
                    </div>
                  )}
                </div>
              )}
              <p className="trend-note">{t.noGenderNote}</p>
            </>
          )}
        </article>
      </section>

      <footer><span>{t.footerSourceMoe}</span><p>{t.footerNoteMoe}</p><b>{t.rawTotalYear(year, fmt.format(point.total))}</b></footer>
    </main>
  );
}
