import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openXlsx } from "../scripts/lib/xlsx-reader.mjs";
import { resolveHeaderColumns, num } from "../scripts/lib/moe-headers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SOURCE_DIR = resolve(__dirname, "../data/moe");

// KEDI 공표 통계와 대조하는 골든 값. scripts/sync-moe-data.mjs 의 값과 동일해야 한다.
const GOLDEN_TOTALS = {
  2013: 85923, 2014: 84891, 2015: 91332, 2016: 104262, 2017: 123858,
  2018: 142205, 2019: 160165, 2020: 153695, 2021: 152281, 2022: 166892,
  2023: 181842, 2024: 208962, 2025: 253434,
};

const SHEET = { COUNTRY: 1, SCHOOL: 2, CROSS: 3 };

function listSourceFiles() {
  const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".xlsx"));
  const byYear = new Map();
  for (const f of files) {
    const m = f.match(/^(\d{4})\s/);
    assert.ok(m, `파일명에서 연도를 추출할 수 없습니다: ${f}`);
    byYear.set(Number(m[1]), resolve(SOURCE_DIR, f));
  }
  return byYear;
}

function sumTotalColumn(xl, sheetIndex) {
  const { rows } = xl.readSheet(sheetIndex, { minRow: 1 });
  const columns = resolveHeaderColumns(rows);
  const totalIdx = columns.get("총계");
  let sum = 0;
  for (const row of rows.slice(4)) sum += num(row, totalIdx);
  return sum;
}

const byYear = listSourceFiles();
const years = [...byYear.keys()].sort((a, b) => a - b);

test("data/moe 에 13개 연도(2013~2025)가 모두 존재한다", () => {
  assert.deepEqual(years, [
    2013, 2014, 2015, 2016, 2017, 2018, 2019,
    2020, 2021, 2022, 2023, 2024, 2025,
  ]);
});

for (const year of years) {
  test(`${year}년: 국가별/학교별/학교별X국가별 시트 합계가 모두 공표치(${GOLDEN_TOTALS[year]})와 일치한다`, () => {
    const xl = openXlsx(byYear.get(year));
    const golden = GOLDEN_TOTALS[year];
    assert.equal(sumTotalColumn(xl, SHEET.COUNTRY), golden, "국가별 시트 합계 불일치");
    assert.equal(sumTotalColumn(xl, SHEET.SCHOOL), golden, "학교별 시트 합계 불일치");
    assert.equal(sumTotalColumn(xl, SHEET.CROSS), golden, "학교별X국가별 시트 합계 불일치");
  });
}

test("2013년: 공동운영 열이 없어도 헤더 해석기가 정상 동작한다", () => {
  const xl = openXlsx(byYear.get(2013));
  const { rows } = xl.readSheet(SHEET.CROSS, { minRow: 1 });
  const columns = resolveHeaderColumns(rows);
  assert.equal(columns.get("공동운영"), undefined);
  assert.ok(columns.get("학위과정>대학·전문대학>계") != null);
  assert.ok(columns.get("연수과정>계") != null);
});

test("생성된 public/moe-yearly.json 이 존재하면 골든 값과 일치한다", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const path = resolve(__dirname, "../public/moe-yearly.json");
  if (!existsSync(path)) {
    // npm run sync:moe 를 아직 실행하지 않은 환경에서는 건너뛴다.
    return;
  }
  const data = JSON.parse(readFileSync(path, "utf8"));
  for (const point of data.series) {
    assert.equal(point.total, GOLDEN_TOTALS[point.year], `${point.year}년 total 불일치`);
    const programSum = point.byProgram.reduce((sum, p) => sum + p.count, 0);
    assert.equal(programSum, GOLDEN_TOTALS[point.year], `${point.year}년 byProgram 합계 불일치`);
  }
});
