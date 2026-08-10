import { NextResponse } from "next/server";

// 공공데이터포털 "법무부_유학생관리정보 데이터" OAS(OpenAPI) 명세
// 여기서 기준일별 최신 엔드포인트를 자동으로 감지한다.
const OAS_URL = "https://infuser.odcloud.kr/oas/docs?namespace=3069982/v1";
const API_BASE = "https://api.odcloud.kr/api";
const PER_PAGE = 10000;
const API_KEY = process.env.KDATA_API_KEY;
// 동시에 보내는 요청 수 (api.odcloud.kr rate limit 회피)
const CONCURRENCY = 5;

export const revalidate = 21_600;
// Vercel 서버리스 함수 최대 실행 시간 (OAS fetch + 32페이지 페치 + 집계)
export const maxDuration = 60;

/** 공공데이터포털 페이지 응답 구조 */
type ApiResponse = {
  data: { [k: string]: string }[];
  totalCount: number;
};

type Endpoint = { path: string; asOf: string };

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
function aggregate(records: { [k: string]: string }[]) {
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
  const url = `${API_BASE}${path}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${API_KEY}`;
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

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "서버에 KDATA_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);

    // 공공데이터포털에서 최신 기준일 엔드포인트를 자동 감지
    const { path, asOf } = await findLatestEndpoint();

    // 1차 호출로 totalCount 확인
    const first = await fetchPage(path, 1, controller.signal);
    const total: number = first.totalCount;
    const pages = Math.ceil(total / PER_PAGE);

    const pageResults = await fetchAllPages(path, pages, first, controller.signal);
    const records: { [k: string]: string }[] = [];
    for (const data of pageResults) {
      records.push(...data.data);
    }

    clearTimeout(timer);
    const rows = aggregate(records);
    const sum = rows.reduce((acc, r) => acc + (r[4] as number), 0);

    return NextResponse.json(
      {
        meta: {
          title: `법무부 유학생관리정보 데이터_${asOf.replace(/-/g, "")}`,
          asOf,
          total: sum,
          fetchedAt: new Date().toISOString(),
        },
        rows,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "원본 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}