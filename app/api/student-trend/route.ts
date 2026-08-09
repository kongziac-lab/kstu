import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

// 공공데이터포털 "법무부_유학생관리정보 데이터" OAS 명세
const OAS_URL = "https://infuser.odcloud.kr/oas/docs?namespace=3069982/v1";
const API_BASE = "https://api.odcloud.kr/api";
const PER_PAGE = 10000;
const API_KEY = process.env.KDATA_API_KEY;
// 동시에 보내는 요청 수 (api.odcloud.kr rate limit 회피)
const CONCURRENCY = 5;
// 시계열 시작 연도 (2019-12-31 이후부터 동일 필드 구조)
const START_YEAR = 2019;

export const maxDuration = 300; // 최초 캐시 생성 시 여러 기준일 병렬 처리로 시간 소요
// 빌드 시 실행하지 않고 런타임에만 호출
export const dynamic = "force-dynamic";

type ApiResponse = {
  data: { [k: string]: string }[];
  totalCount: number;
};

type Endpoint = { path: string; asOf: string };

/** OAS 명세에서 모든 유학생관리정보 엔드포인트를 기준일별로 수집 */
async function findAllEndpoints(): Promise<Endpoint[]> {
  const res = await fetch(OAS_URL, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`OAS HTTP ${res.status}`);
  const text = await res.text();
  const jsonMatch = text.match(/\{\s*"swagger":\s*"2\.0".*/);
  if (!jsonMatch) throw new Error("OAS JSON을 파싱할 수 없습니다");
  const spec = JSON.parse(jsonMatch[0]);

  const endpoints: Endpoint[] = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    const op = (methods as Record<string, { summary?: string }>).get;
    if (!op) continue;
    const summary: string = op.summary ?? "";
    const m = summary.match(/유학생관리정보\s*데이터_(\d{8})/);
    if (!m) continue;
    const year = Number(m[1].slice(0, 4));
    if (year < START_YEAR) continue;
    const asOf = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
    endpoints.push({ path, asOf });
  }
  // 기준일 오름차순 정렬
  return endpoints.sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
}

async function fetchPage(path: string, page: number, signal: AbortSignal): Promise<ApiResponse> {
  const url = `${API_BASE}${path}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${API_KEY}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** 제한된 동시성으로 한 기준일의 모든 페이지를 fetch */
async function fetchAllPages(path: string, signal: AbortSignal): Promise<{ [k: string]: string }[]> {
  const first = await fetchPage(path, 1, signal);
  const total: number = first.totalCount;
  const pages = Math.ceil(total / PER_PAGE);
  const results = new Array<ApiResponse>(pages);
  results[0] = first;
  let cursor = 1;

  const workers = Array.from({ length: Math.min(CONCURRENCY, pages - 1) }, async () => {
    while (cursor < pages) {
      const page = cursor++;
      const data = await fetchPage(path, page + 1, signal);
      results[page] = data;
    }
  });
  await Promise.all(workers);

  const records: { [k: string]: string }[] = [];
  for (const data of results) records.push(...data.data);
  return records;
}

/**
 * 한 기준일의 raw 레코드를 학교별 집계.
 * 2021 이후는 4필드, 2019~2020은 개인 레코드(순번/생년/체류지 포함) — 학교명/국적명/체류자격/성별은 공통 존재.
 */
function aggregateBySchool(records: { [k: string]: string }[]) {
  const map = new Map<string, number>();
  for (const r of records) {
    const school = r["학교명"] == null || r["학교명"] === "" ? "미상" : String(r["학교명"]);
    map.set(school, (map.get(school) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** 한 기준일의 raw 레코드를 (학교, 체류자격) / (학교, 국적) 집계 */
function aggregateCross(records: { [k: string]: string }[]) {
  const byStatus = new Map<string, number>();
  const byCountry = new Map<string, number>();
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

/** 시계열 데이터 전체를 계산 (캐시용) */
async function buildTrendData() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 280_000);

  try {
    const endpoints = await findAllEndpoints();

    // 각 기준일을 병렬로 처리 (기준일 단위 동시성 5로 시간 단축)
    const results: Record<string, unknown> = {};
    const concurrency = 5;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, endpoints.length) }, async () => {
      while (cursor < endpoints.length) {
        const ep = endpoints[cursor++];
        const records = await fetchAllPages(ep.path, controller.signal);
        const schoolAgg = aggregateBySchool(records);
        const { byStatus, byCountry } = aggregateCross(records);
        results[ep.asOf] = {
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
        };
      }
    });
    await Promise.all(workers);

    clearTimeout(timer);
    return Object.values(results).sort((a, b) => {
      const aa = (a as { asOf: string }).asOf;
      const bb = (b as { asOf: string }).asOf;
      return aa < bb ? -1 : 1;
    });
  } catch {
    clearTimeout(timer);
    throw new Error("시계열 데이터를 불러오지 못했습니다.");
  }
}

/** 12시간 캐시된 시계열 데이터 fetch */
const getTrendData = unstable_cache(
  async () => buildTrendData(),
  ["student-trend"],
  { revalidate: 43_200 }, // 12시간
);

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ error: "서버에 KDATA_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  try {
    const series = await getTrendData();
    return NextResponse.json(
      { series },
      {
        headers: {
          "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "시계열 데이터를 불러오지 못했습니다." }, { status: 502 });
  }
}