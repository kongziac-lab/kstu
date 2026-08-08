import { NextResponse } from "next/server";

// 공공데이터포털 "법무부_유학생관리정보 데이터" 최신 엔드포인트 (2026-06-30 기준)
const BASE_URL =
  "https://api.odcloud.kr/api/3069982/v1/uddi:b851d214-1a5c-4eeb-8566-ab7f1aeaa3db";
const PER_PAGE = 10000;
const API_KEY = process.env.KDATA_API_KEY;

export const revalidate = 21_600;

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

async function fetchPage(page: number, signal: AbortSignal) {
  const url = `${BASE_URL}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${API_KEY}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
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
    const timer = setTimeout(() => controller.abort(), 20_000);

    // 1차 호출로 totalCount 확인
    const first = await fetchPage(1, controller.signal);
    const total: number = first.totalCount;
    const records: { [k: string]: string }[] = [];
    const pages = Math.ceil(total / PER_PAGE);

    for (let page = 1; page <= pages; page++) {
      const data = page === 1 ? first : await fetchPage(page, controller.signal);
      records.push(...data.data);
    }

    clearTimeout(timer);
    const rows = aggregate(records);
    const sum = rows.reduce((acc, r) => acc + (r[4] as number), 0);

    return NextResponse.json(
      {
        meta: {
          title: `법무부 유학생관리정보 데이터_${total}`,
          asOf: "2026-06-30",
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