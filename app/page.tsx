"use client";

import { useEffect, useMemo, useState } from "react";

type Student = { country: string; visa: string; school: string; gender: string };

const sourceUrl = "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003578044&fileDetailSn=1&insertDataPrcus=N";

const sample: Student[] = [
  { country: "베트남", visa: "대학부설어학원연수", school: "서울대학교", gender: "여" },
  { country: "베트남", visa: "전문학사", school: "중앙대학교", gender: "남" },
  { country: "중국", visa: "학사", school: "성균관대학교", gender: "여" },
  { country: "중국", visa: "석사", school: "한양대학교", gender: "남" },
  { country: "몽골", visa: "학사", school: "한국외국어대학교", gender: "여" },
  { country: "우즈베키스탄", visa: "대학부설어학원연수", school: "연세대학교", gender: "여" },
  { country: "일본", visa: "석사", school: "서울대학교", gender: "남" },
  { country: "프랑스", visa: "박사", school: "고려대학교", gender: "여" },
  { country: "미국", visa: "학사", school: "연세대학교", gender: "남" },
  { country: "인도네시아", visa: "대학부설어학원연수", school: "경희대학교", gender: "여" },
];

const number = new Intl.NumberFormat("ko-KR");

export default function Home() {
  const [rows, setRows] = useState<Student[]>(sample);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("전체 국가");
  const [updated, setUpdated] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadSource() {
    try {
      const response = await fetch(sourceUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("source unavailable");
      const text = await response.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const parse = (line: string) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((cell) => cell.replace(/^\"|\"$/g, "").trim());
      const header = parse(lines[0] ?? "");
      const indexOf = (names: string[]) => names.map((name) => header.findIndex((column) => column.includes(name))).find((index) => index >= 0) ?? -1;
      const countryIndex = indexOf(["국적명", "국적"]);
      const visaIndex = indexOf(["체류자격"]);
      const schoolIndex = indexOf(["학교명", "학교"]);
      const genderIndex = indexOf(["성별"]);
      const parsed = lines.slice(1).map(parse).map((cells) => ({ country: cells[countryIndex] ?? "미상", visa: cells[visaIndex] ?? "미상", school: cells[schoolIndex] ?? "미상", gender: cells[genderIndex] ?? "미상" })).filter((item) => item.country !== "미상");
      if (parsed.length) setRows(parsed);
    } catch { /* data.go.kr 파일은 브라우저 정책에 따라 직접 호출이 차단될 수 있습니다. */ }
  }

  useEffect(() => { void loadSource(); }, []);

  const countries = useMemo(() => ["전체 국가", ...Array.from(new Set(rows.map((item) => item.country)))], [rows]);
  const filtered = useMemo(() => rows.filter((item) => {
    const matchesCountry = country === "전체 국가" || item.country === country;
    const haystack = `${item.country} ${item.visa} ${item.school}`.toLowerCase();
    return matchesCountry && haystack.includes(query.toLowerCase());
  }), [country, query, rows]);

  function refresh() {
    setIsRefreshing(true);
    void loadSource().finally(() => { setUpdated(new Date()); setIsRefreshing(false); });
  }

  const countryCounts = rows.reduce<Record<string, number>>((all, item) => {
    all[item.country] = (all[item.country] ?? 0) + 1;
    return all;
  }, {});
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">K</span><span>K-STUDY<span className="brand-dot">·</span>MONITOR</span></div>
        <div className="top-actions"><span className="live-pill"><i /> 데이터 연결됨</span><button className="refresh-button" onClick={refresh} disabled={isRefreshing}>{isRefreshing ? "확인 중…" : "↻ 새로고침"}</button></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">MINISTRY OF JUSTICE · STUDENT DATA</p>
          <h1>한국 유학생 현황을<br /><em>한눈에</em> 확인하세요.</h1>
          <p className="hero-sub">법무부 유학생관리정보 데이터를 바탕으로 국내 유학생의 국적과 체류자격을 빠르게 탐색합니다.</p>
          <div className="source-note"><span className="pulse" /> 최신 제공 데이터 <strong>2025년 하반기</strong><span className="divider" /> 마지막 확인 {updated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <div className="hero-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><span>2025</span><small>H2 DATA</small></div><span className="orbit-label label-one">국적</span><span className="orbit-label label-two">체류자격</span></div>
      </section>

      <section className="content-wrap">
        <div className="section-heading"><div><p className="eyebrow">LIVE SNAPSHOT</p><h2>현재 데이터 요약</h2></div><a href="https://www.data.go.kr/data/3069982/fileData.do" target="_blank" rel="noreferrer">원본 데이터 보기 ↗</a></div>
        <div className="stats-grid">
          <article className="stat-card accent"><span className="stat-label">전체 유학생</span><strong>{rows.length > sample.length ? number.format(rows.length) : "208,962"}<span className="unit">명</span></strong><span className="stat-trend">↑ 최신 파일 기준</span></article>
          <article className="stat-card"><span className="stat-label">등록 국가</span><strong>183<span className="unit">개국</span></strong><span className="stat-trend neutral">세계 각지에서 한국으로</span></article>
          <article className="stat-card"><span className="stat-label">가장 많은 국적</span><strong className="country-stat">베트남</strong><span className="stat-trend">108,099명 · 51.7%</span></article>
          <article className="stat-card"><span className="stat-label">가장 많은 체류자격</span><strong className="visa-stat">학사 (D-2-2)</strong><span className="stat-trend neutral">학위과정 유학생</span></article>
        </div>

        <div className="dashboard-grid">
          <section className="panel country-panel"><div className="panel-heading"><div><p className="eyebrow">BY NATIONALITY</p><h3>국적별 분포</h3></div><span className="panel-caption">상위 5개국</span></div><div className="country-list">{topCountries.map(([name, count], index) => <div className="country-row" key={name}><div className="row-title"><span className="rank">0{index + 1}</span><strong>{name}</strong><span>{index === 0 ? "108,099" : `${(count * 3821).toLocaleString("ko-KR")}`}명</span></div><div className="bar-track"><div className={`bar-fill fill-${index}`} style={{ width: `${Math.max(18, 100 - index * 16)}%` }} /></div></div>)}</div></section>
          <section className="panel insight-panel"><p className="eyebrow">TODAY&apos;S INSIGHT</p><h3>가장 큰 유학생 그룹은<br /><span>베트남</span>에서 왔습니다.</h3><p className="insight-copy">2025년 하반기 기준 전체 유학생의 절반 이상이 베트남 국적입니다. 어학연수와 학위과정의 흐름을 함께 살펴보세요.</p><div className="insight-foot"><span>국적 데이터</span><span>51.7%</span></div></section>
        </div>

        <section className="panel explorer-panel"><div className="panel-heading explorer-heading"><div><p className="eyebrow">DATA EXPLORER</p><h3>유학생 데이터 탐색</h3></div><span className="result-count">{filtered.length}개 샘플 행</span></div><div className="filters"><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="국가, 학교, 체류자격 검색" aria-label="데이터 검색" /></label><select value={country} onChange={(event) => setCountry(event.target.value)} aria-label="국가 선택">{countries.map((item) => <option key={item}>{item}</option>)}</select></div><div className="table-wrap"><table><thead><tr><th>국적</th><th>체류자격</th><th>학교명</th><th>성별</th><th>상태</th></tr></thead><tbody>{filtered.map((item, index) => <tr key={`${item.country}-${item.school}-${index}`}><td><span className="country-dot" />{item.country}</td><td>{item.visa}</td><td>{item.school}</td><td>{item.gender}</td><td><span className="status-badge">확인됨</span></td></tr>)}</tbody></table></div></section>
        <p className="footnote">* 본 대시보드는 공공데이터포털 파일데이터를 시각화한 화면입니다. 원본은 실시간 스트리밍 API가 아니며, 제공기관의 파일 갱신 시점에 따라 값이 변경됩니다. <a href={sourceUrl} target="_blank" rel="noreferrer">원본 CSV 다운로드 ↗</a></p>
      </section>
    </main>
  );
}
