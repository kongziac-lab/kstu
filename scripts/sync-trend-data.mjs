#!/usr/bin/env node
/**
 * 시계열 유학생 데이터 동기화 스크립트
 *
 * 공공데이터포털 "법무부_유학생관리정보 데이터"의 모든 기준일(2019~현재) 데이터를
 * fetch하여 학교/체류자격/국가별 집계 후 public/trend-data.json 으로 저장한다.
 *
 * 이 파일은 빌드 시 생성되어 Vercel 정적 서빙으로 즉시 로드된다.
 *
 * 사용법:
 *   KDATA_API_KEY=<인증키> node scripts/sync-trend-data.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const OAS_URL = "https://infuser.odcloud.kr/oas/docs?namespace=3069982/v1";
const API_BASE = "https://api.odcloud.kr/api";
const PER_PAGE = 10000;
const API_KEY = process.env.KDATA_API_KEY;
const CONCURRENCY = 5;
const START_YEAR = 2019;
const OUTPUT = resolve(__dirname, "../public/trend-data.json");

if (!API_KEY) {
  console.error("오류: KDATA_API_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

async function findAllEndpoints() {
  const res = await fetch(OAS_URL);
  const text = await res.text();
  const spec = JSON.parse(text.match(/\{\s*"swagger":\s*"2\.0".*/)[0]);
  const endpoints = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    const op = methods.get;
    if (!op) continue;
    const m = (op.summary ?? "").match(/유학생관리정보\s*데이터_(\d{8})/);
    if (!m) continue;
    const year = Number(m[1].slice(0, 4));
    if (year < START_YEAR) continue;
    // 반기 기준일(6월 30일, 12월 31일)만 포함. 2020-02-06 같은 중간 기점은 제외해 일관성 유지.
    const monthDay = m[1].slice(4, 8);
    if (monthDay !== "0630" && monthDay !== "1231") continue;
    const asOf = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
    endpoints.push({ path, asOf });
  }
  return endpoints.sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
}

async function fetchPage(path, page) {
  const url = `${API_BASE}${path}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAllPages(path) {
  const first = await fetchPage(path, 1);
  const total = first.totalCount;
  const pages = Math.ceil(total / PER_PAGE);
  const results = new Array(pages);
  results[0] = first;
  let cursor = 1;
  const workers = Array.from({ length: Math.min(CONCURRENCY, pages - 1) }, async () => {
    while (cursor < pages) {
      const page = cursor++;
      results[page] = await fetchPage(path, page + 1);
    }
  });
  await Promise.all(workers);
  return results.flatMap((d) => d.data);
}

function aggregateBySchool(records) {
  const map = new Map();
  for (const r of records) {
    const school = r["학교명"] == null || r["학교명"] === "" ? "미상" : String(r["학교명"]);
    map.set(school, (map.get(school) || 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function aggregateCross(records) {
  const byStatus = new Map();
  const byCountry = new Map();
  for (const r of records) {
    const school = r["학교명"] == null || r["학교명"] === "" ? "미상" : String(r["학교명"]);
    const status = r["체류자격"] ?? "미상";
    const country = r["국적명"] ?? "미상";
    const sk = `${school}\u0000${status}`;
    const ck = `${school}\u0000${country}`;
    byStatus.set(sk, (byStatus.get(sk) || 0) + 1);
    byCountry.set(ck, (byCountry.get(ck) || 0) + 1);
  }
  return { byStatus, byCountry };
}

async function main() {
  console.error(`[sync-trend] 시작: ${OAS_URL}`);
  const endpoints = await findAllEndpoints();
  console.error(`[sync-trend] 기준일 ${endpoints.length}개 발견`);

  const results = [];
  const concurrency = 5;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, endpoints.length) }, async () => {
    while (cursor < endpoints.length) {
      const ep = endpoints[cursor++];
      console.error(`[sync-trend] ${ep.asOf} 처리 중...`);
      const records = await fetchAllPages(ep.path);
      const schoolAgg = aggregateBySchool(records);
      const { byStatus, byCountry } = aggregateCross(records);
      results.push({
        asOf: ep.asOf,
        total: records.length,
        schools: schoolAgg,
        status: [...byStatus.entries()].map(([k, v]) => {
          const [school, status] = k.split("\u0000");
          return { school, status, count: v };
        }),
        country: [...byCountry.entries()].map(([k, v]) => {
          const [school, country] = k.split("\u0000");
          return { school, country, count: v };
        }),
      });
    }
  });
  await Promise.all(workers);

  results.sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
  const output = { generatedAt: new Date().toISOString(), series: results };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output) + "\n", "utf8");
  console.error(`[sync-trend] 완료: ${results.length}개 기준일 → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(`[sync-trend] 실패: ${err.message}`);
  process.exit(1);
});