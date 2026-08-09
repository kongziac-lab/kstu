"use client";

import { useEffect, useMemo, useState } from "react";
import { HIGHER_EDUCATION_INSTITUTIONS } from "./higher-education-institutions";

type Row = [string, string, string, string, number];
type Dataset = { meta: { asOf: string; total: number }; rows: Row[] };
type TrendPoint = { asOf: string; total: number; schools: { name: string; count: number }[]; status: { school: string; status: string; count: number }[]; country: { school: string; country: string; count: number }[] };
type TrendSeries = { series: TrendPoint[] };
type SchoolAggregate = { name: string; value: number; variants: { name: string; value: number }[] };

const fmt = new Intl.NumberFormat("ko-KR");
const DEFAULT_SCHOOL = "전체 기관명";
const DEFAULT_SCHOOL_LABEL = "전체 교육기관명";
const DEFAULT_SCHOOL_QUERY = DEFAULT_SCHOOL_LABEL;

const STATUS_ORDER = [
  "학사과정",
  "석사과정",
  "박사과정",
  "전문학사과정",
  "교환학생",
  "대학부설 어학원 연수",
  "학술연구기관 특정연구자",
  "(구)교환학생",
  "외국어연수생",
];

const EXCELLENT_CERTIFIED_SCHOOLS = `
건국대학교, 건양대학교, 경북대학교, 경성대학교, 경희대학교, 계명대학교, 고려대학교, 단국대학교, 덕성여자대학교, 동국대학교, 부산대학교, 부산외국어대학교, 서경대학교, 서울시립대학교, 서울신학대학교, 서울여자대학교, 선문대학교, 성결대학교, 성균관대학교, 성신여자대학교, 세종대학교, 숙명여자대학교, 아주대학교, 울산과학기술원, 이화여자대학교, 인하대학교, 제주대학교, 중부대학교, 중앙대학교, 충남대학교, 포항공과대학교, 한국항공대학교, 한성대학교, 한양대학교, 홍익대학교, 경복대학교, 울산과학대학교, 인하공업전문대학, 개신대학원대학교, 과학기술연합대학원대학교, 국립암센터국제암대학원대학교, 한국개발연구원국제정책대학원대학교, 한국전력국제원자력대학원대학교
`;

const CERTIFIED_SCHOOLS = `
가천대학교, 가톨릭대학교, 강남대학교, 강서대학교, 강원대학교, 건국대학교, 건양대학교, 경기대학교, 경남대학교, 경동대학교, 경북대학교, 경상국립대학교, 경성대학교, 경운대학교, 경일대학교, 경희대학교, 계명대학교, 고려대학교, 고신대학교, 광운대학교, 광주과학기술원, 광주대학교, 광주여자대학교, 국립경국대학교, 국립공주대학교, 국립군산대학교, 국립금오공과대학교, 국립목포대학교, 국립부경대학교, 국립순천대학교, 국립창원대학교, 국립한국교통대학교, 국립한국해양대학교, 국립한밭대학교, 국민대학교, 김천대학교, 나사렛대학교, 남서울대학교, 단국대학교, 대구가톨릭대학교, 대구대학교, 대구한의대학교, 대신대학교, 대전대학교, 대진대학교, 덕성여자대학교, 동국대학교, 동덕여자대학교, 동명대학교, 동서대학교, 동신대학교, 동아대학교, 동의대학교, 명지대학교, 목원대학교, 배재대학교, 백석대학교, 부산대학교, 부산외국어대학교, 삼육대학교, 상명대학교, 서강대학교, 서경대학교, 서울과학기술대학교, 서울기독대학교, 서울대학교, 서울시립대학교, 서울신학대학교, 서울여자대학교, 선문대학교, 성결대학교, 성공회대학교, 성균관대학교, 성신여자대학교, 세명대학교, 세종대학교, 숙명여자대학교, 순천향대학교, 숭실대학교, 신라대학교, 신한대학교, 아주대학교, 안양대학교, 연세대학교, 영남대학교, 영산대학교, 우석대학교, 우송대학교, 울산과학기술원, 울산대학교, 원광대학교, 위덕대학교, 을지대학교, 이화여자대학교, 인제대학교, 인천대학교, 인하대학교, 전남대학교, 전북대학교, 전주대학교, 제주대학교, 조선대학교, 중부대학교, 중앙대학교, 중원대학교, 차의과학대학교, 창신대학교, 청주대학교, 충남대학교, 충북대학교, 평택대학교, 포항공과대학교, 한국과학기술원, 한국교원대학교, 한국기술교육대학교, 한국성서대학교, 한국외국어대학교, 한국항공대학교, 한남대학교, 한동대학교, 한림대학교, 한서대학교, 한성대학교, 한세대학교, 한양대학교, 호서대학교, 홍익대학교, 경남도립거창대학, 경남정보대학교, 경복대학교, 경인여자대학교, 계명문화대학교, 군장대학교, 대림대학교, 동원과학기술대학교, 동원대학교, 동의과학대학교, 명지전문대학, 목포과학대학교, 부산과학기술대학교, 부천대학교, 서울예술대학교, 서정대학교, 안산대학교, 영남이공대학교, 영진전문대학교, 오산대학교, 용인예술과학대학교, 울산과학대학교, 원광보건대학교, 인덕대학교, 인하공업전문대학, 장안대학교, 전북과학대학교, 전주비전대학교, 제주관광대학교, 제주한라대학교, 한국영상대학교, 한양여자대학교, 개신대학원대학교, 과학기술연합대학원대학교, 국립암센터국제암대학원대학교, 국제언어대학원대학교, 동방문화대학원대학교, 서울과학종합대학원대학교, 서울미디어대학원대학교, 서울외국어대학원대학교, 선학유피대학원대학교, 수도국제대학원대학교, 예명대학원대학교, 온석대학원대학교, 한국개발연구원국제정책대학원대학교, 한국전력국제원자력대학원대학교, 한국학중앙연구원 한국학대학원, 횃불트리니티신학대학원대학교
`;

function normalizeSchoolName(name: string) {
  return name
    .replace(/\([^)]*\)/g, "")
    .replace(/^국립대학법인\s*/g, "")
    .replace(/^국립\s*/g, "")
    .replace(/캠퍼스/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function standardizeSchoolName(name: string) {
  if (name === "미상") return name;
  return name
    .trim()
    .replace(/^\(학\)\s*/g, "")
    .replace(/^학교법인\s+/g, "")
    .replace(/^국립대학법인\s+/g, "")
    .replace(/^국립\s*(?=.*(?:대학교|대학|과학기술원|교육대학교))/g, "")
    .replace(/대학교.+캠퍼스$/g, "대학교")
    .replace(/(대학교|대학)\s+.+캠퍼스$/g, "$1")
    .replace(/\s+/g, " ");
}

const higherEducationInstitutionMap = new Map<string, string>();

HIGHER_EDUCATION_INSTITUTIONS.split(",").forEach((value) => {
  const name = value.trim();
  const key = normalizeSchoolName(name);
  if (key && !higherEducationInstitutionMap.has(key)) {
    higherEducationInstitutionMap.set(key, standardizeSchoolName(name));
  }
});

const higherEducationInstitutionPrefixes = [...higherEducationInstitutionMap.keys()]
  .sort((a, b) => b.length - a.length)
  .reduce((map, key) => {
    const initial = key[0];
    const keys = map.get(initial) || [];
    keys.push(key);
    map.set(initial, keys);
    return map;
  }, new Map<string, string[]>());

function resolveHigherEducationInstitution(rawName: string) {
  const normalized = normalizeSchoolName(rawName);
  if (!normalized || normalized === "미상") return null;

  const exact = higherEducationInstitutionMap.get(normalized);
  if (exact) return exact;

  if (normalized.endsWith("대학")) {
    const renamed = higherEducationInstitutionMap.get(`${normalized}교`);
    if (renamed) return renamed;
  }

  const matchingPrefix = (higherEducationInstitutionPrefixes.get(normalized[0]) || [])
    .find((key) => normalized.startsWith(key));
  return matchingPrefix ? higherEducationInstitutionMap.get(matchingPrefix) || null : null;
}

const excellentCertifiedSet = new Set(
  EXCELLENT_CERTIFIED_SCHOOLS.split(",").map(normalizeSchoolName).filter(Boolean)
);

const certifiedSet = new Set(
  CERTIFIED_SCHOOLS.split(",").map(normalizeSchoolName).filter(Boolean)
);

function getCertification(name: string) {
  const normalized = normalizeSchoolName(name);
  if (excellentCertifiedSet.has(normalized)) return "우수";
  if (certifiedSet.has(normalized)) return "일반";
  return null;
}

function orderStatuses(items: [string, number][]) {
  const order = new Map(STATUS_ORDER.map((name, index) => [name, index]));
  return [...items].sort((a, b) =>
    (order.get(a[0]) ?? STATUS_ORDER.length) -
    (order.get(b[0]) ?? STATUS_ORDER.length)
  );
}

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
    const item = map.get(name) || { name, value: 0, variants: [] };
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

function prioritizeKeimyung<T extends string | { name: string }>(items: T[]) {
  const getName = (item: T) => typeof item === "string" ? item : item.name;
  const keimyungIndex = items.findIndex((item) => getName(item) === "계명대학교");
  const hanyangIndex = items.findIndex((item) => getName(item) === "한양대학교");
  if (keimyungIndex < 0 || hanyangIndex < 0 || keimyungIndex < hanyangIndex) return items;

  const reordered = [...items];
  const [keimyung] = reordered.splice(keimyungIndex, 1);
  reordered.splice(hanyangIndex, 0, keimyung);
  return reordered;
}

function hasHigherEducationInstitution(row: Row) {
  return Boolean(resolveHigherEducationInstitution(row[0]));
}

export default function Home() {
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
        if (active) setLoadError("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadAttempt]);

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
  }, [options.schools, schoolQuery]);

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
    const key = `${r[1]} · ${r[2]}`;
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

  if (!data) return <main className="loading">{loadError ? <><p>{loadError}</p><button type="button" onClick={() => { setLoadError(null); setLoadAttempt((value) => value + 1); }}>다시 시도</button></> : <><div className="loader"/><p>유학생 현황을 불러오는 중입니다</p></>}</main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">K</div>
        <div className="brand"><strong>K-유학생 데이터랩</strong><span>법무부 외국인 유학생 체류 현황</span></div>
        <div className="source"><span className="live-dot"/> 공공데이터포털 API <b>정상</b></div>
      </header>

      <main>
        <section className="hero">
          <div><p className="eyebrow">IMMIGRATION DATA INSIGHT</p><h1>외국인 유학생 체류 현황</h1><p>학교, 국가, 체류자격, 성별로 살펴보는 대한민국 유학생 데이터</p></div>
          <div className="asof"><span>데이터 기준일</span><strong>2026. 06. 30.</strong><small>법무부 유학생관리정보</small></div>
        </section>

        <section className="filters" aria-label="데이터 필터">
          <label className="school-filter"><span>고등교육기관명</span><div className="school-combobox"><input value={schoolQuery} onFocus={() => setSchoolOpen(true)} onChange={(e) => { setSchoolQuery(e.target.value); setSchool("전체 기관명"); setSchoolOpen(true); }} onKeyDown={(e) => { if (e.key === "Escape") setSchoolOpen(false); }} placeholder="고등교육기관명 검색" aria-label="고등교육기관명 검색" role="combobox" aria-expanded={schoolOpen} aria-controls="school-options-list"/><button type="button" onClick={() => { setSchoolQuery(""); setSchool("전체 기관명"); setSchoolOpen(true); }} aria-label="전체 교육기관명 삭제">×</button>{schoolOpen && <div className="school-options" id="school-options-list" role="listbox"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSchool("전체 기관명")}>{DEFAULT_SCHOOL_LABEL}</button>{schoolSuggestions.map((name) => <button type="button" key={name} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSchool(name)}>{name}</button>)}{schoolSuggestions.length === 0 && <em>검색 결과가 없습니다</em>}</div>}</div></label>
          <label><span>국가</span><select aria-label="국가" value={country} onChange={(e) => setCountry(e.target.value)}><option>전체 국가</option>{options.countries.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label><span>체류자격</span><select aria-label="체류자격" value={status} onChange={(e) => setStatus(e.target.value)}><option>전체 체류자격</option>{options.statuses.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label><span>성별</span><select aria-label="성별" value={gender} onChange={(e) => setGender(e.target.value)}><option>전체 성별</option>{options.genders.map((v) => <option key={v}>{v}</option>)}</select></label>
          <button className="reset" onClick={reset}>↻ 초기화</button>
        </section>

        <section className="kpis">
          <article><div className="kpi-icon mint"><Icon>人</Icon></div><div><span>전체 유학생</span><strong>{fmt.format(total)}<small>명</small></strong><em>고등교육기관명 표기 기준</em></div></article>
          <article><div className="kpi-icon blue"><Icon>校</Icon></div><div><span>고등교육기관 수</span><strong>{fmt.format(higherEducationInstitutions.length)}<small>개</small></strong><em>기관명 중복 제거 기준</em></div></article>
          <article><div className="kpi-icon orange"><Icon>國</Icon></div><div><span>출신 국가</span><strong>{fmt.format(countries.length)}<small>개국</small></strong><em>국적 분류 기준</em></div></article>
          <article><div className="kpi-icon violet"><Icon>證</Icon></div><div><span>체류자격 유형</span><strong>{fmt.format(statuses.length)}<small>개</small></strong><em>과정·연수 유형</em></div></article>
        </section>

        <section className="chart-grid">
          <article className="panel wide country-panel"><div className="panel-head"><div><span>국가별 현황</span><h2>주요 출신 국가</h2></div><b>{countryDetailOpen ? `전체 ${fmt.format(countries.length)}개국` : "상위 8개 국가"}</b></div><div className="bars">{countries.slice(0, countryDetailOpen ? countries.length : 8).map(([name, value], i) => <div className="bar-row" key={name}><span className="rank">{String(i + 1).padStart(2,"0")}</span><strong>{name}</strong><div className="bar-track"><i style={{width: `${(value / (countries[0]?.[1] || 1)) * 100}%`}}/></div><b>{fmt.format(value)}</b><small>{total ? ((value / total) * 100).toFixed(1) : 0}%</small></div>)}</div><button className="country-detail-toggle" type="button" onClick={() => setCountryDetailOpen((v) => !v)} aria-expanded={countryDetailOpen}>{countryDetailOpen ? "전체 국가 접기" : `전체 ${fmt.format(countries.length)}개국 상세보기`}<span aria-hidden="true">{countryDetailOpen ? "⌃" : "⌄"}</span></button></article>
          <article className="panel gender-panel"><div className="panel-head"><div><span>성별 현황</span><h2>유학생 성비</h2></div></div><div className="donut-wrap"><div className="donut" style={{background: `conic-gradient(#0c6f68 0 ${malePct}%, #ef8c68 ${malePct}% 100%)`}}><div><strong>{fmt.format(total)}</strong><span>전체</span></div></div></div><div className="legend"><div><i className="male"/><span>남성</span><strong>{fmt.format(male)}</strong><b>{malePct}%</b></div><div><i className="female"/><span>여성</span><strong>{fmt.format(female)}</strong><b>{femalePct}%</b></div></div></article>
        </section>

        <section className="chart-grid lower">
          <article className="panel status-panel"><div className="panel-head"><div><span>체류자격별 현황</span><h2>과정 및 연수 유형</h2></div></div><div className="status-list">{statuses.map(([name,value],i) => <div key={name}><div><span>{name}</span><b>{fmt.format(value)}명</b></div><div className="status-track"><i className={`c${i}`} style={{width:`${(value/statusMax)*100}%`}}/></div><small>{total ? ((value/total)*100).toFixed(1) : 0}%</small></div>)}</div></article>
          <article className="panel table-panel"><div className="panel-head table-title"><div><span>고등교육기관별 현황</span><h2>고등교육기관명 기준 집계</h2><p className="data-caution">원본 기관명에서 학교법인·국립대학법인·캠퍼스 표기 등을 정리해 고등교육기관명으로 묶었습니다. 인증 배지는 Study in Korea의 교육국제화역량 인증대학 명단 기준입니다.</p></div><div className="table-tools"><label className="cert-filter"><span>인증 보기</span><select value={certificationView} onChange={(e)=>{ setCertificationView(e.target.value); setSchoolDisplayLimit(10); setOpenVariants([]); }} aria-label="인증 구분 보기"><option>전체 인증</option><option value="우수">우수인증</option><option value="일반">일반인증</option><option>미표기</option></select></label><label className="search">⌕<input value={search} onChange={(e)=>{ setSearch(e.target.value); setSchoolDisplayLimit(10); setOpenVariants([]); }} placeholder="고등교육기관명 검색" aria-label="고등교육기관명 검색"/></label></div></div><div className="school-table"><div className="tr th"><span>순위</span><span>고등교육기관명</span><span>유학생 수</span><span>비율</span></div>{schools.slice(0, visibleSchoolLimit).map(({ name, value, variants },i)=>{ const certification = getCertification(name); const variantsOpen = openVariants.includes(name); return <div className="school-row-group" key={name}><div className="tr"><span>{i+1}</span><strong>{name}{certification && <em className={`cert-badge ${certification === "우수" ? "excellent" : ""}`}>{certification} 인증</em>}{variants.length > 1 && <button className="variant-toggle" type="button" onClick={() => toggleVariants(name)} aria-expanded={variantsOpen}>{variantsOpen ? "원본 내역 접기" : `원본 내역 보기 · ${variants.length}개`}<span>{variantsOpen ? "⌃" : "⌄"}</span></button>}</strong><b>{fmt.format(value)}명</b><span>{total ? ((value/total)*100).toFixed(1):0}%</span></div>{variantsOpen && <div className="variant-list">{variants.map((variant) => <div key={variant.name}><span>{variant.name}</span><b>{fmt.format(variant.value)}명</b><small>{value ? ((variant.value / value) * 100).toFixed(1) : 0}%</small></div>)}</div>}</div>; })}</div>{schools.length === 0 && <p className="empty-table">조건에 맞는 고등교육기관이 없습니다.</p>}<div className="rank-actions"><p>{fmt.format(schools.length)}개 고등교육기관 중 {fmt.format(visibleSchoolLimit)}개 표시</p>{visibleSchoolLimit < schools.length && <button className="expand-schools" type="button" onClick={() => setSchoolDisplayLimit((v) => Math.min(v + 30, schools.length))}>다음 30위 펼치기</button>}{visibleSchoolLimit > 10 && <button className="collapse-schools" type="button" onClick={() => setSchoolDisplayLimit(10)}>10위까지만 보기</button>}</div></article>
        </section>

        <section className="course-country-section">
          <article className="panel course-country-panel"><div className="panel-head"><div><span>과정별 국가 현황</span><h2>과정·연수 유형별 출신 국가</h2><p className="course-country-note">고등교육기관·국가·성별 필터를 적용하며, 상단 체류자격 필터와 별도로 과정을 선택합니다.</p></div><b>{fmt.format(courseTotal)}명</b></div><div className="course-tabs" role="tablist" aria-label="과정 선택">{options.statuses.map((name) => <button type="button" role="tab" aria-selected={courseView === name} className={courseView === name ? "active" : ""} key={name} onClick={() => setCourseView(name)}>{name}</button>)}</div><div className="course-country-summary"><div><span>선택 과정</span><strong>{courseView}</strong></div><div><span>유학생</span><strong>{fmt.format(courseTotal)}명</strong></div><div><span>출신 국가</span><strong>{fmt.format(courseCountries.length)}개국</strong></div></div>{courseCountries.length > 0 ? <div className="course-country-table"><div className="course-country-head"><span>순위</span><span>국가</span><span>분포</span><span>유학생 수</span><span>과정 내 비율</span></div><div className="course-country-list">{courseCountries.map(([name, value], i) => <div className="course-country-row" key={name}><span>{fmt.format(i + 1)}</span><strong>{name}</strong><div className="course-country-track"><i style={{width: `${(value / courseCountryMax) * 100}%`}}/></div><b>{fmt.format(value)}명</b><small>{courseTotal ? ((value / courseTotal) * 100).toFixed(1) : 0}%</small></div>)}</div><p>{courseView}에 포함된 {fmt.format(courseCountries.length)}개 국가 전체 순위입니다.</p></div> : <p className="empty-course-country">현재 필터 조건에 해당하는 {courseView} 유학생이 없습니다.</p>}</article>
        </section>

        <section className="trend-section">
          <article className="panel trend-panel">
            <div className="panel-head"><div><span>시계열 변동</span><h2>{school === "전체 기관명" ? "전체 유학생 수 추이 (2019~현재)" : `${school} 유학생 수 추이 (2019~현재)`}</h2><p className="trend-note">공공데이터포털 기준일(반기)별 부처 데이터. 이 차트의 유학생 수는 <strong>전체 유학생</strong>(고등교육기관 외 체류지·상호 표기, 미상 포함) 기준이며, 상단 KPI의 전체 유학생은 <strong>고등교육기관으로 분류된 학생</strong>만 집계한 값이라 차이가 있습니다.</p></div><b>{fmt.format(school === "전체 기관명" ? (trendAll[trendAll.length - 1]?.total ?? 0) : (trendSchool[trendSchool.length - 1]?.total ?? 0))}<small>명 (최신)</small></b></div>
            {trendError ? <p className="trend-error">시계열 데이터를 불러오지 못했습니다.</p> : !trend ? <p className="trend-loading">시계열 데이터를 불러오는 중입니다...</p> : (
              <>
                <div className="trend-chart">
                  {(school === "전체 기관명" ? trendAll : trendSchool).map((point) => {
                    const data = school === "전체 기관명" ? trendAll : trendSchool;
                    const max = Math.max(...data.map((p) => p.total), 1);
                    return <div className="trend-col" key={point.asOf}><div className="trend-bar-wrap"><div className="trend-val">{fmt.format(point.total)}</div><i className={`trend-bar ${point.asOf.endsWith(".12") ? "h2" : "h1"}`} style={{ height: `${(point.total / max) * 100}%` }} title={`${point.asOf}: ${point.total}명`}/></div><span>{point.asOf}</span></div>;
                  })}
                </div>
                <div className="trend-legend"><span><i className="h1"/>6월 (상반기)</span><span><i className="h2"/>12월 (하반기)</span></div>
                {school !== "전체 기관명" && (
                  <div className="trend-breakdown">
                    <h3>체류자격별 변동</h3>
                    <table className="trend-table"><thead><tr><th>기준일</th>{statusesFromTrend.map((s) => <th key={s}>{s}</th>)}</tr></thead><tbody>{trendStatus.map((row) => <tr key={row.asOf}><td>{row.asOf}</td>{statusesFromTrend.map((s) => <td key={s}>{fmt.format(Number((row as Record<string, unknown>)[s]) || 0)}</td>)}</tr>)}</tbody></table>
                    <h3>국가별 변동 (상위 {trendCountries.length})</h3>
                    <table className="trend-table"><thead><tr><th>기준일</th>{trendCountries.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{trendCountry.map((row) => <tr key={row.asOf}><td>{row.asOf}</td>{trendCountries.map((c) => <td key={c}>{fmt.format(Number((row as Record<string, unknown>)[c]) || 0)}</td>)}</tr>)}</tbody></table>
                  </div>
                )}
              </>
            )}
          </article>
        </section>

        <section className="unknown-panel">
          <div className="unknown-heading">
            <div><span>DATA QUALITY NOTE</span><h2>고등교육기관명 미상 상세분석</h2><p>법무부 API 원본에서 고등교육기관명이 비어 있는 자료를 그대로 묶은 값입니다.</p></div>
            <strong>{fmt.format(unknownTotal)}<small>명</small><em>전체의 {data.meta.total ? ((unknownTotal / data.meta.total) * 100).toFixed(1) : 0}%</em></strong>
          </div>
          <button className="unknown-toggle" type="button" onClick={() => setUnknownOpen((v) => !v)} aria-expanded={unknownOpen}>{unknownOpen ? "접기" : "펼쳐보기"}</button>
          {unknownOpen && <>
            <div className="unknown-facts">
              <div><b>{fmt.format(unknownCountries.length)}</b><span>개 국적</span></div>
              <div><b>{fmt.format(unknownStatuses.length)}</b><span>개 체류자격</span></div>
              <p>원본에는 학교명 누락 사유나 대체 기관코드가 없어 특정 학교로 임의 배정하지 않았습니다.</p>
            </div>
            <div className="unknown-grid">
              <div><h3>상위 국적</h3>{unknownCountries.slice(0, 5).map(([name, value]) => <div className="unknown-row" key={name}><span>{name}</span><b>{fmt.format(value)}명</b><small>{unknownTotal ? ((value / unknownTotal) * 100).toFixed(1) : 0}%</small></div>)}</div>
              <div><h3>체류자격 분포</h3>{unknownStatuses.map(([name, value]) => <div className="unknown-row" key={name}><span>{name}</span><b>{fmt.format(value)}명</b><small>{unknownTotal ? ((value / unknownTotal) * 100).toFixed(1) : 0}%</small></div>)}</div>
              <div><h3>상위 국적·체류자격 조합</h3>{unknownCombinations.slice(0, 5).map(([name, value]) => <div className="unknown-row" key={name}><span>{name}</span><b>{fmt.format(value)}명</b><small>{unknownTotal ? ((value / unknownTotal) * 100).toFixed(1) : 0}%</small></div>)}<p className="unknown-caution">소속기관 미입력, 학교와 연결되지 않은 연수 기록, 행정자료 연계 문제 등은 가능한 설명이지만 원자료로 확인되지 않은 추정입니다.</p></div>
            </div>
          </>}
        </section>

        <footer><span>DATA SOURCE · 법무부 유학생관리정보 OpenAPI</span><p>본 통계는 제공된 공공데이터를 집계한 것으로, 행정 목적의 공식 통계와 차이가 있을 수 있습니다.</p><b>원자료 총 {fmt.format(data.meta.total)}건</b></footer>
      </main>
    </div>
  );
}
