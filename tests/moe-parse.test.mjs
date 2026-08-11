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
    // 정규화된 학교별 집계 합계도 같은 골든 값과 일치해야 한다(학교명 정규화가
    // 총계를 잃어버리거나 부풀리지 않았는지 확인).
    const schoolSum = point.bySchool.reduce((sum, s) => sum + s.total, 0);
    assert.equal(schoolSum, GOLDEN_TOTALS[point.year], `${point.year}년 bySchool 합계 불일치`);
  }
});

test("학교명 정규화: 연도별 표기 변화(국립 접두사 등)가 하나의 고등교육기관으로 합쳐진다", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const path = resolve(__dirname, "../public/moe-yearly.json");
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, "utf8"));

  // 2013년엔 "강릉원주대학교", 2025년엔 "국립강릉원주대학교"로 표기가 바뀌었지만
  // 전역 사전(dict.schools)에는 정규화된 이름 하나로만 존재해야 한다.
  assert.ok(data.dict.schools.includes("강릉원주대학교"), "정규화된 이름이 사전에 없음");
  assert.ok(!data.dict.schools.includes("국립강릉원주대학교"), "정규화 안 된 표기가 그대로 남아있음");

  // 학교별 시트에 대학원 단위가 별도 행으로 실리는 2013년 특성상, 정규화 후
  // 연도별 학교 수는 순수 기관 수에 가까운 범위(300~450개)여야 한다. 이 범위를
  // 크게 벗어나면 정규화가 과소/과다 병합됐다는 신호다.
  for (const point of data.series) {
    assert.ok(
      point.bySchool.length >= 300 && point.bySchool.length <= 450,
      `${point.year}년 정규화된 학교 수(${point.bySchool.length}개)가 예상 범위(300~450)를 벗어남`
    );
  }
});

test("moe-cross-{year}.json 의 schools 상세 데이터가 존재하면 학교별 total이 byProgram 합계와 일치한다", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const path = resolve(__dirname, "../public/moe-cross-2025.json");
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(data.schools && Object.keys(data.schools).length > 0, "schools 상세 데이터가 비어있음");

  let checked = 0;
  for (const detail of Object.values(data.schools)) {
    const programSum = detail.byProgram.reduce((sum, p) => sum + p.count, 0);
    assert.equal(programSum, detail.total, "학교별 byProgram 합계가 total과 불일치");
    if (detail.variants) {
      const variantSum = detail.variants.reduce((sum, v) => sum + v.total, 0);
      assert.equal(variantSum, detail.total, "학교별 variants 합계가 total과 불일치");
    }
    checked++;
  }
  assert.ok(checked > 300, `검증한 학교 수(${checked})가 너무 적음`);
});

test("moe-cross-{year}.json 의 rows에 과정별(대학·전문대학/석사/박사/공동운영/연수과정) 인원이 포함되어 총계와 일치한다", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const path = resolve(__dirname, "../public/moe-cross-2025.json");
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(data.rows.length > 5000, "rows가 예상보다 너무 적음(과정별 컬럼이 안 붙었을 가능성)");

  let programSumTotal = 0;
  let totalSum = 0;
  for (const row of data.rows) {
    assert.equal(row.length, 8, "row 길이가 [학교idx,국가idx,총계,과정5개]=8이 아님");
    const [, , total, ...programs] = row;
    const programSum = programs.reduce((a, b) => a + b, 0);
    assert.equal(programSum, total, `row 과정별 합계(${programSum})가 총계(${total})와 불일치`);
    programSumTotal += programSum;
    totalSum += total;
  }
  assert.equal(programSumTotal, totalSum);
  assert.equal(totalSum, 253434, "2025년 rows 총계가 골든값과 불일치");
});

test("moe-school-trend.json 이 존재하면 학교별 연도 총계가 moe-cross-{year}.json 의 total과 일치한다", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const trendPath = resolve(__dirname, "../public/moe-school-trend.json");
  if (!existsSync(trendPath)) return;
  const trend = JSON.parse(readFileSync(trendPath, "utf8"));

  assert.deepEqual(trend.programs, ["대학·전문대학", "석사과정", "박사과정", "공동운영", "연수과정"]);

  const kmuIndex = trend.dict.schools.indexOf("계명대학교");
  assert.ok(kmuIndex >= 0, "계명대학교가 사전에 없음");
  const kmuTrend = trend.bySchool[kmuIndex];
  assert.deepEqual(kmuTrend.years, trend.years, "계명대학교는 전 연도(2013~2025)에 존재해야 함");

  let checked = 0;
  for (let i = 0; i < kmuTrend.years.length; i++) {
    const year = kmuTrend.years[i];
    const crossPath = resolve(__dirname, `../public/moe-cross-${year}.json`);
    if (!existsSync(crossPath)) continue;
    const cross = JSON.parse(readFileSync(crossPath, "utf8"));
    assert.equal(cross.schools[kmuIndex].total, kmuTrend.total[i], `${year}년 계명대학교 total 불일치`);
    const programSum = kmuTrend.byProgram[i].reduce((a, b) => a + b, 0);
    assert.equal(programSum, kmuTrend.total[i], `${year}년 계명대학교 byProgram 합계 불일치`);
    const countrySum = kmuTrend.byCountry[i].reduce((sum, [, c]) => sum + c, 0);
    assert.equal(countrySum, kmuTrend.total[i], `${year}년 계명대학교 byCountry 합계 불일치`);
    // moe-cross-{year}.json의 학교x국가 rows에서 직접 집계한 값과도 대조한다(같은
    // crossMap에서 나왔지만 완전히 다른 코드 경로로 재구성했으므로 교차검증 의미가 있음).
    const rowsSum = cross.rows.filter(([s]) => s === kmuIndex).reduce((sum, [, , c]) => sum + c, 0);
    assert.equal(rowsSum, kmuTrend.total[i], `${year}년 계명대학교 moe-cross rows 합계 불일치`);
    checked++;
  }
  assert.ok(checked > 0, "대조할 moe-cross-{year}.json이 하나도 없음");
});
