// 교육부/KEDI 연도별 집계 JSON(scripts/sync-moe-data.mjs가 빌드 때 public/에 생성)을
// 서버에서 읽는다. Vercel 함수 번들에 포함되도록 next.config.ts의
// outputFileTracingIncludes에 같은 파일들을 등록해 두었다.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MoeSchoolTrend, MoeYearly } from "./types";

const cache = new Map<string, Promise<unknown>>();

// 경로는 호출부에서 문자열 리터럴로 만든다 — 변수로 조립하면 번들러가 public/ 전체(수십 MB)를
// 함수에 포함시킨다.
function readJson<T>(path: string): Promise<T> {
  let pending = cache.get(path);
  if (!pending) {
    pending = readFile(path, "utf8").then((text) => JSON.parse(text));
    // 실패한 읽기는 캐시하지 않는다 (다음 호출에서 다시 시도)
    pending.catch(() => cache.delete(path));
    cache.set(path, pending);
  }
  return pending as Promise<T>;
}

export function getMoeYearly() {
  return readJson<MoeYearly>(join(process.cwd(), "public", "moe-yearly.json"));
}

export function getMoeSchoolTrend() {
  return readJson<MoeSchoolTrend>(join(process.cwd(), "public", "moe-school-trend.json"));
}
