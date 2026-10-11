import { NextResponse } from "next/server";
import { fetchMojDataset, getMojApiKey } from "../../lib/moj-data";

export const revalidate = 21_600;
// Vercel 서버리스 함수 최대 실행 시간 (OAS fetch + 32페이지 페치 + 집계)
export const maxDuration = 60;

export async function GET() {
  if (!getMojApiKey()) {
    return NextResponse.json(
      { error: "서버에 KDATA_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    const dataset = await fetchMojDataset(controller.signal);
    clearTimeout(timer);

    return NextResponse.json(dataset, {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "원본 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
