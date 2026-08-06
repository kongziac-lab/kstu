import { NextResponse } from "next/server";

const DATA_URL = "https://k-student-datalab.halan80228.chatgpt.site/student-data.json";

export const revalidate = 21_600;

export async function GET() {
  try {
    const response = await fetch(DATA_URL, {
      next: { revalidate },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "원본 데이터 요청에 실패했습니다." }, { status: 502 });
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.rows)) {
      return NextResponse.json({ error: "원본 데이터 형식이 올바르지 않습니다." }, { status: 502 });
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "원본 데이터에 연결할 수 없습니다." }, { status: 502 });
  }
}
