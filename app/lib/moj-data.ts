// 법무부 유학생관리정보(공공데이터포털 OpenAPI) 원본을 받아 대시보드 형식으로 집계한다.
// app/api/student-data(대시보드)와 app/api/mcp(MCP 서버)가 같은 로직을 공유한다.
import type { Row } from "./types";

// 공공데이터포털 "법무부_유학생관리정보 데이터" OAS(OpenAPI) 명세
// 여기서 기준일별 최신 엔드포인트를 자동으로 감지한다.
const OAS_URL = "https://infuser.odcloud.kr/oas/docs?namespace=3069982/v1";
const API_BASE = "https://api.odcloud.kr/api";
const PER_PAGE = 10000;
// 동시에 보내는 요청 수 (api.odcloud.kr rate limit 회피)
const CONCURRENCY = 5;
// 서버 인스턴스 메모리 캐시 유지 시간 (api/student-data의 revalidate와 동일한 6시간)
const CACHE_TTL_MS = 21_600_000;

/** 공공데이터포털 페이지 응답 구조 */
type ApiResponse = {
  data: { [k: string]: string }[];
  totalCount: number;
};

type Endpoint = { path: string; asOf: string };

export type MojDataset = {
  meta: { title: string; asOf: string; total: number; fetchedAt: string };
  rows: Row[];
};

export function getMojApiKey() {
  return process.env.KDATA_API_KEY;
}

/**
 * OAS 명세에서 "법무부_유학생관리정보 데이터_YYYYMMDD" 엔드포인트 중
 * 기준일이 가장 최신인 것을 찾는다.
 * 반환: { path: "/3069982/v1/uddi:...", asOf: "YYYY-MM-DD" }
 */
async function findLatestEndpoint(): Promise<Endpoint> {
  const res = await fetch(OAS_URL, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`OAS HTTP ${res.status}`);
  const text = await res.text();
  // OAS는 HTML에 swagger JSON을 포함한다. JSON 객체 본문을 추출한다.
  const jsonMatch = text.match(/\{\s*"swagger":\s*"2\.0".*/);
  if (!jsonMatch) throw new Error("OAS JSON을 파싱할 수 없습니다");
  const spec = JSON.parse(jsonMatch[0]);

  let best: Endpoint | null = null;
  for (const [path, methods] of Object.entries(spec.paths)) {
    const op = (methods as Record<string, { summary?: string }>).get;
    if (!op) continue;
    const summary: string = op.summary ?? "";
    // "법무부_유학생관리정보 데이터_YYYYMMDD" 형태만 대상
    const m = summary.match(/유학생관리정보\s*데이터_(\d{8})/);
    if (!m) continue;
    const asOf = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
    if (!best || asOf > best.asOf) best = { path, asOf };
  }
  if (!best) throw new Error("OAS에서 유학생관리정보 엔드포인트를 찾지 못했습니다");
  return best;
}

/** API 원본(개인별 레코드)을 대시보드 JSON 형식으로 집계 */
function aggregate(records: { [k: string]: string }[]): Row[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const school =
      r["학교명"] == null || r["학교명"] === "" ? "미상" : String(r["학교명"]);
    const key = `${school}\u0000${r["국적명"]}\u0000${r["체류자격"]}\u0000${r["성별"]}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map].map(([key, count]) => {
    const [school, country, status, gender] = key.split("\u0000");
    return [school, country, status, gender, count];
  });
}

async function fetchPage(path: string, page: number, signal: AbortSignal): Promise<ApiResponse> {
  const url = `${API_BASE}${path}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${getMojApiKey()}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/** 제한된 동시성으로 페이지들을 fetch */
async function fetchAllPages(
  path: string,
  pages: number,
  first: ApiResponse,
  signal: AbortSignal,
) {
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
  return results;
}

/** 최신 기준일 원본을 전부 받아 집계한다. KDATA_API_KEY가 필요하다. */
export async function fetchMojDataset(signal: AbortSignal): Promise<MojDataset> {
  if (!getMojApiKey()) throw new Error("서버에 KDATA_API_KEY가 설정되지 않았습니다.");

  // 공공데이터포털에서 최신 기준일 엔드포인트를 자동 감지
  const { path, asOf } = await findLatestEndpoint();

  // 1차 호출로 totalCount 확인
  const first = await fetchPage(path, 1, signal);
  const pages = Math.ceil(first.totalCount / PER_PAGE);

  const pageResults = await fetchAllPages(path, pages, first, signal);
  const records: { [k: string]: string }[] = [];
  for (const data of pageResults) {
    records.push(...data.data);
  }

  const rows = aggregate(records);
  const total = rows.reduce((acc, r) => acc + r[4], 0);
  return {
    meta: {
      title: `법무부 유학생관리정보 데이터_${asOf.replace(/-/g, "")}`,
      asOf,
      total,
      fetchedAt: new Date().toISOString(),
    },
    rows,
  };
}

let cached: { at: number; data: MojDataset } | null = null;
let inflight: Promise<MojDataset> | null = null;

/**
 * fetchMojDataset의 메모리 캐시 버전 — 같은 서버 인스턴스에서 6시간 동안 재사용하고,
 * 동시에 들어온 요청은 하나의 원본 fetch를 공유한다.
 */
export async function getMojDataset(): Promise<MojDataset> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  if (!inflight) {
    inflight = fetchMojDataset(AbortSignal.timeout(55_000))
      .then((data) => {
        cached = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
