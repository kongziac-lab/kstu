/**
 * 교육부/KEDI 「고등교육기관 외국인(외국) 유학생 현황」 엑셀의 병합 헤더(2~4행)를
 * 열 인덱스 매핑으로 해석한다. `국가별`/`학교별`/`학교별X국가별` 세 시트 모두
 * 동일한 헤더 구조(식별 열 + 총계 + 학위과정[3단×6분야] + 공동운영 + 연수과정[5종])를
 * 공유하므로 하나의 해석기로 처리한다.
 *
 * 연도별 표기 차이를 흡수한다:
 *  - 2013년에는 "교육과정 공동운영" 열 자체가 없음
 *  - "어학연수생/교환연수생/…" (2013~2020) vs "어학연수/교환연수/…" (2021~2025)
 *  - "교육과정\n공동운영" vs "공동운영/교육과정" 등 줄바꿈·순서 차이
 */

function normalizeGroupLabel(text) {
  const compact = (text || "").replace(/\s+/g, "");
  if (compact.includes("공동운영")) return "공동운영";
  if (compact.includes("학위과정")) return "학위과정";
  if (compact.includes("연수과정")) return "연수과정";
  return compact;
}

function normalizeLeafLabel(text) {
  const compact = (text || "").replace(/\s+/g, "");
  // 어학연수생 -> 어학연수, 교환연수생 -> 교환연수 등 (2013~2020년 표기 흡수)
  return compact.replace(/생$/, "");
}

/**
 * @param {string[][]} rows - readSheet(...).rows 결과 (minRow:1, 즉 rows[0]=파일 1행)
 * @returns {Map<string, number>} "학위과정>석사과정>공학" 같은 경로 -> 0-based 열 인덱스
 */
export function resolveHeaderColumns(rows) {
  const row2 = rows[1] || [];
  const row3 = rows[2] || [];
  const row4 = rows[3] || [];
  const maxCol = Math.max(row2.length, row3.length, row4.length);

  // 병합 셀은 첫 열에만 값이 있으므로 오른쪽으로 값을 이어 채운다(forward-fill).
  const filledRow2 = [];
  let last2 = "";
  for (let c = 0; c < maxCol; c++) {
    const v = (row2[c] || "").trim();
    if (v) last2 = v;
    filledRow2.push(last2);
  }

  // row3(하위그룹)은 "학위과정" 구간 안에서만 유효하므로, 그룹이 바뀌면 초기화한다.
  const filledRow3 = [];
  let last3 = "";
  let prevGroup = null;
  for (let c = 0; c < maxCol; c++) {
    const group = normalizeGroupLabel(filledRow2[c]);
    if (group !== prevGroup) {
      last3 = "";
      prevGroup = group;
    }
    const v = (row3[c] || "").trim();
    if (v) last3 = v;
    filledRow3.push(group === "학위과정" ? last3 : "");
  }

  const pathToCol = new Map();
  for (let c = 0; c < maxCol; c++) {
    const group = normalizeGroupLabel(filledRow2[c]);
    const sub = filledRow3[c];
    const leaf = (row4[c] || "").trim();
    let path;
    if (group === "학위과정" && sub && leaf) {
      path = ["학위과정", sub, normalizeLeafLabel(leaf)];
    } else if (group === "연수과정" && leaf) {
      path = ["연수과정", normalizeLeafLabel(leaf)];
    } else if (group && !sub && !leaf) {
      // 단독 열: 연도/학제/학교명/…/총계/공동운영
      path = [group];
    } else {
      continue;
    }
    const key = path.join(">");
    if (!pathToCol.has(key)) pathToCol.set(key, c);
  }
  return pathToCol;
}

export const DEGREE_PROGRAMS = ["대학·전문대학", "석사과정", "박사과정"];
export const FIELDS = ["인문사회", "공학", "자연", "의학", "예체능"];
export const TRAINING_TYPES = ["어학연수", "교환연수", "방문연수", "기타연수"];

/** 셀 값을 숫자로 안전 변환한다. 열이 존재하지 않거나(idx undefined) 빈 문자열이면 0. */
export function num(row, idx) {
  if (idx == null) return 0;
  const v = row[idx];
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}
