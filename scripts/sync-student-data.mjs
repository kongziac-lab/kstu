#!/usr/bin/env node
/**
 * 법무부 유학생관리정보 데이터 동기화 스크립트
 *
 * 공공데이터포털 API(법무부_유학생관리정보 데이터)에서 최신 원본을 가져와
 * 대시보드가 사용하는 public/student-data.json 형식으로 변환·저장한다.
 *
 * 📌 API가 업데이트되면(새 기준일 데이터 배포) 이 스크립트를 실행해 데이터를 최신화한다.
 *
 * 사용법:
 *   KDATA_API_KEY=<인증키> node scripts/sync-student-data.mjs [-- diff]
 *   -- diff: 출력만(표준출력) 하고 파일에 쓰지 않음
 *
 * 환경변수:
 *   KDATA_API_KEY  (필수)  공공데이터포털 인증키(serviceKey)
 *   KDATA_BASE_URL (선택)  API base URL (기본값: 아래 상수)
 *   KDATA_OUTPUT   (선택)  출력 JSON 경로 (기본값: public/student-data.json)
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ── 설정 ────────────────────────────────────────────────
// 공공데이터포털 "법무부_유학생관리정보 데이터" 최신 엔드포인트 (2026-06-30 기준)
const DEFAULT_BASE_URL =
  "https://api.odcloud.kr/api/3069982/v1/uddi:b851d214-1a5c-4eeb-8566-ab7f1aeaa3db";
const BASE_URL = process.env.KDATA_BASE_URL || DEFAULT_BASE_URL;
const API_KEY = process.env.KDATA_API_KEY;
const OUTPUT = process.env.KDATA_OUTPUT
  ? resolve(process.env.KDATA_OUTPUT)
  : resolve(__dirname, "../public/student-data.json");
const PER_PAGE = 10000;
const ONLY_DIFF = process.argv.includes("--diff");

if (!API_KEY) {
  console.error("오류: KDATA_API_KEY 환경변수가 필요합니다.");
  console.error("사용법: KDATA_API_KEY=<인증키> node scripts/sync-student-data.mjs");
  process.exit(1);
}

// 파이썬 SSL 인증 문제와 달리 Node fetch는 기본 SSL 검증을 사용한다.
// (macOS Python에서만 self-signed 체인 이슈가 있었음)

async function fetchPage(page) {
  const url = `${BASE_URL}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** API 원본(개인별 레코드)을 대시보드 JSON 형식으로 집계 */
function aggregate(records) {
  const map = new Map(); // key: 학교|국적|자격|성별 -> count
  for (const r of records) {
    // 학교명이 null/비어있으면 대시보드가 쓰는 "미상"으로 정규화
    const school = r["학교명"] == null || r["학교명"] === "" ? "미상" : String(r["학교명"]);
    const key = `${school}\u0000${r["국적명"]}\u0000${r["체류자격"]}\u0000${r["성별"]}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  const rows = [];
  for (const [key, count] of map) {
    const [school, country, status, gender] = key.split("\u0000");
    rows.push([school, country, status, gender, count]);
  }
  return rows;
}

async function main() {
  console.error(`[sync] 시작: ${BASE_URL}`);
  console.error(`[sync] 인증키: ${API_KEY.slice(0, 6)}...`);

  // 1차 호출로 totalCount 확인
  const first = await fetchPage(1);
  const total = first.totalCount;
  console.error(`[sync] 전체 레코드: ${total.toLocaleString()}건`);

  const records = [];
  const pages = Math.ceil(total / PER_PAGE);
  for (let page = 1; page <= pages; page++) {
    const data = page === 1 ? first : await fetchPage(page);
    records.push(...data.data);
    console.error(`[sync] 페이지 ${page}/${pages} (누적 ${records.length.toLocaleString()}건)`);
    if (page < pages) await new Promise((r) => setTimeout(r, 300));
  }

  const rows = aggregate(records);
  const sum = rows.reduce((acc, r) => acc + r[4], 0);
  // API 응답에는 meta가 없다. 기준일은 OAS 문서의 엔드포인트 요약에서 확인된 값.
  // 새 데이터가 배포되면 이 상수를 갱신하거나 KDATA_ASOF 로 지정한다.
  const asOf = process.env.KDATA_ASOF || "2026-06-30";
  const dataset = {
    meta: {
      title: `법무부 유학생관리정보 데이터_${asOf.replace(/-/g, "")}`,
      asOf,
      total: sum,
      fetchedAt: new Date().toISOString(),
    },
    rows,
  };

  // 표시용: 실제 원본 기준일
  console.error(`[sync] 완료: ${rows.length.toLocaleString()}개 그룹, 총 ${sum.toLocaleString()}명`);

  if (ONLY_DIFF) {
    process.stdout.write(JSON.stringify(dataset, null, 2) + "\n");
  } else {
    writeFileSync(OUTPUT, JSON.stringify(dataset, null, 2) + "\n", "utf8");
    console.error(`[sync] 저장: ${OUTPUT}`);
  }
}

main().catch((err) => {
  console.error(`[sync] 실패: ${err.message}`);
  process.exit(1);
});