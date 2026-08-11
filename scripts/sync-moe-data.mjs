#!/usr/bin/env node
/**
 * 교육부/한국교육개발원(KEDI) 「고등교육기관 외국인(외국) 유학생 현황」 연도별 동기화 스크립트
 *
 * data/moe/*.xlsx (2013~2025, 연 1회 4월 1일 기준) 을 파싱해
 *   - public/moe-yearly.json      : 연도별 집계(학위과정/전공계열/연수유형/국가별/학교별/지역별/설립별/학제별), 즉시 로드
 *   - public/moe-cross-{year}.json: 연도별 학교x국가 교차표, 연도 선택 시 지연 로딩
 * 로 저장한다.
 *
 * 법무부 API(scripts/sync-trend-data.mjs)와 달리 API 키가 필요 없다 — 저장소에
 * 커밋된 로컬 xlsx만 읽으므로 언제든 재현 가능하다.
 *
 * 사용법:
 *   node scripts/sync-moe-data.mjs
 */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openXlsx } from "./lib/xlsx-reader.mjs";
import { resolveHeaderColumns, num, DEGREE_PROGRAMS, FIELDS, TRAINING_TYPES } from "./lib/moe-headers.mjs";
import { canonicalizeSchoolName, normalizeSchoolName } from "../app/lib/school-names.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SOURCE_DIR = resolve(__dirname, "../data/moe");
const OUTPUT_DIR = resolve(__dirname, "../public");

// 학교명/국가명 합성키 구분자. 두 이름 모두 이 문자를 포함하지 않는다는 전제.
const KEY_SEP = "|";

// KEDI 공표 통계(각 연도 "국가별" 시트 총계 합산치)와 대조하는 골든 값.
// 하나라도 어긋나면 파싱 로직이나 헤더 매핑이 잘못되었다는 뜻이므로 빌드를 중단한다.
const GOLDEN_TOTALS = {
  2013: 85923, 2014: 84891, 2015: 91332, 2016: 104262, 2017: 123858,
  2018: 142205, 2019: 160165, 2020: 153695, 2021: 152281, 2022: 166892,
  2023: 181842, 2024: 208962, 2025: 253434,
};

// 시트 표시 순서(0-based): 주=0, 국가별=1, 학교별=2, 학교별X국가별=3 (13개 파일 공통 확인됨)
const SHEET = { COUNTRY: 1, SCHOOL: 2, CROSS: 3 };

function listSourceFiles() {
  const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".xlsx"));
  const byYear = new Map();
  for (const f of files) {
    const m = f.match(/^(\d{4})\s/);
    if (!m) throw new Error(`파일명에서 연도를 추출할 수 없습니다: ${f}`);
    byYear.set(Number(m[1]), resolve(SOURCE_DIR, f));
  }
  return byYear;
}

function readDataRows(xl, sheetIndex) {
  const { rows } = xl.readSheet(sheetIndex, { minRow: 1 });
  const columns = resolveHeaderColumns(rows);
  return { columns, dataRows: rows.slice(4) }; // 1~4행 헤더, 5행부터 데이터
}

function programIndexes(columns) {
  return {
    total: columns.get("총계"),
    degree: DEGREE_PROGRAMS.map((p) => columns.get(`학위과정>${p}>계`)),
    fields: DEGREE_PROGRAMS.map((p) => FIELDS.map((f) => columns.get(`학위과정>${p}>${f}`))),
    joint: columns.get("공동운영"), // 2013년에는 열 자체가 없음 -> undefined -> num()이 0 처리
    training: columns.get("연수과정>계"),
    trainingTypes: TRAINING_TYPES.map((t) => columns.get(`연수과정>${t}`)),
  };
}

function bump(map, key, value) {
  map.set(key, (map.get(key) || 0) + value);
}

function processYear(year, filePath) {
  const xl = openXlsx(filePath);

  // --- 국가별 시트: 국가별 집계 + 연도 전체(학위과정/전공계열/연수유형) 집계 ---
  const countrySheet = readDataRows(xl, SHEET.COUNTRY);
  const countryNameIdx = countrySheet.columns.get("국가/지역명");
  const cIdx = programIndexes(countrySheet.columns);

  const byCountry = new Map(); // 국가명 -> 총계
  const yearByProgram = new Map(); // 대학·전문대학/석사과정/박사과정/공동운영/연수과정 -> 인원
  const yearByField = new Map(); // "석사과정>공학" -> 인원
  const yearByTraining = new Map(); // 어학연수/교환연수/방문연수/기타연수 -> 인원
  let yearTotal = 0;

  for (const row of countrySheet.dataRows) {
    const country = row[countryNameIdx];
    if (!country) continue;
    const total = num(row, cIdx.total);
    yearTotal += total;
    bump(byCountry, country, total);

    DEGREE_PROGRAMS.forEach((program, i) => {
      bump(yearByProgram, program, num(row, cIdx.degree[i]));
      FIELDS.forEach((field, fi) => {
        bump(yearByField, `${program}>${field}`, num(row, cIdx.fields[i][fi]));
      });
    });
    bump(yearByProgram, "공동운영", num(row, cIdx.joint));
    bump(yearByProgram, "연수과정", num(row, cIdx.training));
    TRAINING_TYPES.forEach((type, i) => bump(yearByTraining, type, num(row, cIdx.trainingTypes[i])));
  }

  // --- 학교별 시트: 지역/설립/학제는 원본(캠퍼스) 단위로, 학교명은 법무부와 동일한
  // canonicalizeSchoolName()으로 정규화해 (학)/재단/국립 접두사·연도별 표기 변경을
  // 하나의 고등교육기관으로 묶는다. 화이트리스트에 없는 이름도 표준화만 되어
  // 그대로 남으므로(총계 유실 없음) 골든값 검증에 영향이 없다.
  const schoolSheet = readDataRows(xl, SHEET.SCHOOL);
  const sc = schoolSheet.columns;
  const schoolNameIdx = sc.get("학교명");
  const regionIdx = sc.get("시도");
  const foundingIdx = sc.get("설립");
  const schoolTypeIdx = sc.get("학제");
  const sIdx = programIndexes(sc);

  const schoolDetails = new Map(); // 정규화된 학교명 -> { total, variants, program, field, training }
  const byRegion = new Map(); // 시도 -> 총계
  const byFounding = new Map(); // 설립(국립/공립/사립) -> 총계
  const bySchoolType = new Map(); // 학제(대학교/전문대학/…) -> 총계
  let schoolSheetTotal = 0;

  for (const row of schoolSheet.dataRows) {
    const rawName = row[schoolNameIdx];
    if (!rawName) continue;
    const name = canonicalizeSchoolName(rawName);
    const total = num(row, sIdx.total);
    schoolSheetTotal += total;
    bump(byRegion, row[regionIdx] || "미상", total);
    bump(byFounding, row[foundingIdx] || "미상", total);
    bump(bySchoolType, row[schoolTypeIdx] || "미상", total);

    let detail = schoolDetails.get(name);
    if (!detail) {
      detail = { total: 0, variants: new Map(), program: new Map(), field: new Map(), training: new Map() };
      schoolDetails.set(name, detail);
    }
    detail.total += total;
    bump(detail.variants, rawName, total);
    DEGREE_PROGRAMS.forEach((program, i) => {
      bump(detail.program, program, num(row, sIdx.degree[i]));
      FIELDS.forEach((field, fi) => {
        bump(detail.field, `${program}>${field}`, num(row, sIdx.fields[i][fi]));
      });
    });
    bump(detail.program, "공동운영", num(row, sIdx.joint));
    bump(detail.program, "연수과정", num(row, sIdx.training));
    TRAINING_TYPES.forEach((type, i) => bump(detail.training, type, num(row, sIdx.trainingTypes[i])));
  }

  // 정규화가 서로 다른 학교를 하나로 뭉개는 사고를 조기에 잡는다. 병합 자체는
  // 크게 일어난다 — 2013년 학교별 시트는 "경희대학교"/"경희대학교국제대학원"처럼
  // 대학원 단위를 별도 행으로 싣는다(원본 933개 중 정규화 후 383개로, 절반 가까이가
  // 이런 하위 단위 병합). "국립OO대학교" -> "OO대학교"(접두사 제거), "창신대학" ->
  // "창신대학교"(대학/대학교 표기 보정)처럼 정당한 변형도 있으므로, 정규화된
  // 두 문자열이 어느 한쪽이든 다른 쪽의 접두사이면 통과시킨다.
  for (const [canonical, detail] of schoolDetails) {
    if (detail.variants.size <= 1) continue;
    const normalizedCanonical = normalizeSchoolName(canonical);
    const mismatched = [...detail.variants.keys()].filter((raw) => {
      const normalizedRaw = normalizeSchoolName(raw);
      return !normalizedRaw.startsWith(normalizedCanonical) && !normalizedCanonical.startsWith(normalizedRaw);
    });
    if (mismatched.length) {
      throw new Error(
        `[${year}] 서로 다른 기관이 하나로 병합된 것으로 의심됩니다: "${canonical}" <- ${mismatched.join(", ")}`
      );
    }
  }

  // --- 학교별X국가별 시트: 연도별 지연 로딩용 교차표(학교x국가, 캠퍼스 합산) ---
  const crossSheet = readDataRows(xl, SHEET.CROSS);
  const xc = crossSheet.columns;
  const xSchoolIdx = xc.get("학교명");
  const xCountryIdx = xc.get("국가/지역명");
  const xTotalIdx = programIndexes(xc).total;

  const crossMap = new Map(); // "정규화된학교명|국가명" -> 총계
  let crossSheetTotal = 0;
  for (const row of crossSheet.dataRows) {
    const rawName = row[xSchoolIdx];
    const country = row[xCountryIdx];
    if (!rawName || !country) continue;
    const name = canonicalizeSchoolName(rawName);
    const total = num(row, xTotalIdx);
    crossSheetTotal += total;
    bump(crossMap, `${name}${KEY_SEP}${country}`, total);
  }

  // --- 자체 검증: 네 집계(국가별/학교별/학교별X국가별 시트 + 정규화된 학교별 집계)와
  // KEDI 공표치가 모두 일치해야 한다 ---
  const golden = GOLDEN_TOTALS[year];
  const programSum = [...yearByProgram.values()].reduce((a, b) => a + b, 0);
  const schoolDetailTotal = [...schoolDetails.values()].reduce((sum, d) => sum + d.total, 0);
  const mismatches = [];
  if (yearTotal !== golden) mismatches.push(`국가별 시트 합계(${yearTotal}) != 공표치(${golden})`);
  if (schoolSheetTotal !== golden) mismatches.push(`학교별 시트 합계(${schoolSheetTotal}) != 공표치(${golden})`);
  if (crossSheetTotal !== golden) mismatches.push(`학교별X국가별 시트 합계(${crossSheetTotal}) != 공표치(${golden})`);
  if (programSum !== golden) mismatches.push(`학위과정+공동운영+연수과정 합계(${programSum}) != 공표치(${golden})`);
  if (schoolDetailTotal !== golden) mismatches.push(`정규화된 학교별 집계 합계(${schoolDetailTotal}) != 공표치(${golden})`);
  if (mismatches.length) {
    throw new Error(`[${year}] 데이터 검증 실패:\n  - ${mismatches.join("\n  - ")}`);
  }

  return {
    year,
    total: yearTotal,
    byProgram: [...yearByProgram.entries()]
      .map(([program, count]) => ({ program, count }))
      .sort((a, b) => b.count - a.count),
    byField: [...yearByField.entries()].map(([key, count]) => {
      const [program, field] = key.split(">");
      return { program, field, count };
    }),
    byTraining: [...yearByTraining.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    byCountry: [...byCountry.entries()]
      .map(([country, total]) => ({ country, total }))
      .sort((a, b) => b.total - a.total),
    bySchool: [...schoolDetails.entries()]
      .map(([school, d]) => ({ school, total: d.total }))
      .sort((a, b) => b.total - a.total),
    byRegion: [...byRegion.entries()]
      .map(([region, total]) => ({ region, total }))
      .sort((a, b) => b.total - a.total),
    byFounding: [...byFounding.entries()]
      .map(([founding, total]) => ({ founding, total }))
      .sort((a, b) => b.total - a.total),
    bySchoolType: [...bySchoolType.entries()]
      .map(([type, total]) => ({ type, total }))
      .sort((a, b) => b.total - a.total),
    schoolDetails, // 내부용 — 최종 출력 전 전역 dict 인덱스로 변환 후 제거
    crossMap, // 내부용 — 최종 출력 전 전역 dict 인덱스로 변환 후 제거
  };
}

function main() {
  console.error(`[sync-moe] 시작: ${SOURCE_DIR}`);
  const byYear = listSourceFiles();
  const years = [...byYear.keys()].sort((a, b) => a - b);
  console.error(`[sync-moe] ${years.length}개 연도 발견: ${years.join(", ")}`);

  const results = years.map((year) => {
    console.error(`[sync-moe] ${year}년 처리 중...`);
    return processYear(year, byYear.get(year));
  });

  // 전 연도 국가/학교 이름의 전역 사전(dict) 구성 — cross 파일은 이 인덱스를 참조한다.
  const countrySet = new Set();
  const schoolSet = new Set();
  for (const r of results) {
    r.byCountry.forEach(({ country }) => countrySet.add(country));
    r.bySchool.forEach(({ school }) => schoolSet.add(school));
  }
  const countries = [...countrySet].sort((a, b) => a.localeCompare(b, "ko"));
  const schools = [...schoolSet].sort((a, b) => a.localeCompare(b, "ko"));
  const countryIndex = new Map(countries.map((c, i) => [c, i]));
  const schoolIndex = new Map(schools.map((s, i) => [s, i]));

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const series = results.map((r) => ({
    year: r.year,
    total: r.total,
    byProgram: r.byProgram,
    byField: r.byField,
    byTraining: r.byTraining,
    byCountry: r.byCountry,
    bySchool: r.bySchool,
    byRegion: r.byRegion,
    byFounding: r.byFounding,
    bySchoolType: r.bySchoolType,
  }));
  const yearlyOutput = {
    generatedAt: new Date().toISOString(),
    years,
    dict: { countries, schools },
    series,
  };
  const yearlyPath = resolve(OUTPUT_DIR, "moe-yearly.json");
  writeFileSync(yearlyPath, JSON.stringify(yearlyOutput) + "\n", "utf8");
  console.error(`[sync-moe] ${yearlyPath} 작성 완료 (${series.length}개 연도)`);

  for (const r of results) {
    const rows = [...r.crossMap.entries()].map(([key, total]) => {
      const sepIndex = key.lastIndexOf(KEY_SEP);
      const school = key.slice(0, sepIndex);
      const country = key.slice(sepIndex + 1);
      return [schoolIndex.get(school), countryIndex.get(country), total];
    });

    // 학교 선택 시 보여줄 카드용 상세 데이터. 스키마(과정/전공계열/연수유형)가
    // 고정된 작은 어휘라 학교 수(수백~천여 개)에 곱해도 무리 없는 크기이며,
    // 이 파일 자체가 학교 선택 시에만 지연 로딩되므로 초기 로드에는 영향 없다.
    const schools = {};
    for (const [name, d] of r.schoolDetails) {
      const idx = schoolIndex.get(name);
      const variants = [...d.variants.entries()]
        .map(([n, total]) => ({ name: n, total }))
        .sort((a, b) => b.total - a.total);
      schools[idx] = {
        total: d.total,
        ...(variants.length > 1 ? { variants } : {}),
        byProgram: [...d.program.entries()]
          .filter(([, count]) => count > 0)
          .map(([program, count]) => ({ program, count }))
          .sort((a, b) => b.count - a.count),
        byField: [...d.field.entries()]
          .filter(([, count]) => count > 0)
          .map(([key, count]) => {
            const [program, field] = key.split(">");
            return { program, field, count };
          }),
        byTraining: [...d.training.entries()]
          .filter(([, count]) => count > 0)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
      };
    }

    const crossPath = resolve(OUTPUT_DIR, `moe-cross-${r.year}.json`);
    writeFileSync(crossPath, JSON.stringify({ year: r.year, rows, schools }) + "\n", "utf8");
  }
  console.error(`[sync-moe] moe-cross-{year}.json ${results.length}개 작성 완료`);
  console.error("[sync-moe] 완료");
}

try {
  main();
} catch (err) {
  console.error(`[sync-moe] 실패: ${err.message}`);
  process.exit(1);
}
