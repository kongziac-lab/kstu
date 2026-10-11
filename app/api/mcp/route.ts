// K-유학생 데이터랩 원격 MCP 서버 (Streamable HTTP, POST /api/mcp).
// 모든 도구는 읽기 전용이며 대시보드와 같은 데이터 로직을 재사용한다.
//   - 법무부: app/lib/moj-data.ts (공공데이터포털 OpenAPI → 학교·국적·체류자격·성별 집계)
//   - 교육부: app/lib/moe-data.ts (빌드 때 생성된 public/moe-*.json)
//   - 학교명 정규화(캠퍼스·법인 표기 → 학교 단위): app/lib/school-names.js
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getMoeSchoolTrend, getMoeYearly } from "../../lib/moe-data";
import { getMojDataset, type MojDataset } from "../../lib/moj-data";
import { orderStatuses } from "../../lib/moj-status";
import { normalizeSchoolName, resolveHigherEducationInstitution } from "../../lib/school-names";
import type { Row } from "../../lib/types";

// 법무부 원본 fetch(최대 ~55초)가 캐시되지 않은 첫 호출에 들어갈 수 있다.
export const maxDuration = 60;

const MOJ_SOURCE = "법무부 유학생관리정보(공공데이터포털 OpenAPI)";
const MOE_SOURCE = "교육부·KEDI 고등교육기관 외국인 유학생 현황(매년 4월 1일 기준)";

const INSTRUCTIONS = `K-유학생 데이터랩(https://kstu.vercel.app)의 외국인 유학생 통계를 조회하는 읽기 전용 MCP 서버입니다.

데이터 출처와 기준일
- 법무부: 공공데이터포털 「법무부_유학생관리정보 데이터」 OpenAPI, 기준일 2026-06-30 (반기마다 갱신되며 새 기준일이 공개되면 자동으로 최신 기준일을 씁니다. 각 도구 결과의 기준일을 확인하세요). 체류자격(학사과정, 대학부설 어학원 연수 등) 기준이며 get_overview, rank_institutions, get_institution이 사용합니다.
- 교육부: 교육부·한국교육개발원(KEDI) 「고등교육기관 외국인(외국) 유학생 현황」, 2013~2025년 연도별(매년 4월 1일 기준). 학위과정·연수과정 기준이며 get_moe_trend가 사용합니다.
- 두 출처는 집계 기준(체류자격 vs 학위과정)과 기준일이 달라 수치를 서로 직접 비교하거나 합산하면 안 됩니다.

법무부 기관 집계 기준
- 원본 기관명에서 학교법인·국립대학법인·캠퍼스 표기를 정리해 학교 단위로 합산합니다(예: 본교와 분교 캠퍼스는 하나의 학교).
- 고등교육기관 명단으로 분류되지 않거나 기관명이 비어 있는("미상") 자료는 기관 순위·검색에서 제외되며, 원자료 총계에는 포함됩니다.

답변 규칙
- 항상 한국어로 답하세요.
- 숫자는 천 단위 콤마로 표기하세요(예: 12,345명).
- 수치를 인용할 때 출처(법무부/교육부)와 기준일(또는 연도)을 함께 밝히세요.`;

// 교육부 원본 과정 구분 (scripts/sync-moe-data.mjs의 PROGRAM_ORDER와 같은 순서)
const MOE_PROGRAMS = ["대학·전문대학", "석사과정", "박사과정", "공동운영", "연수과정"];

const fmt = new Intl.NumberFormat("ko-KR");
const n = (value: number) => fmt.format(value);
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "-");
const signed = (value: number) => (value > 0 ? `+${n(value)}` : value < 0 ? `-${n(-value)}` : "0");

function change(current: number, previous: number | undefined) {
  if (previous === undefined) return "-";
  const diff = current - previous;
  return previous ? `${signed(diff)} (${diff >= 0 ? "+" : ""}${((diff / previous) * 100).toFixed(1)}%)` : signed(diff);
}

function table(head: string[], rows: (string | number)[][]) {
  const line = (cells: (string | number)[]) => `| ${cells.map((c) => (typeof c === "number" ? n(c) : c)).join(" | ")} |`;
  return [line(head), `| ${head.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function text(body: string): ToolResult {
  return { content: [{ type: "text", text: body }] };
}

function errorText(body: string): ToolResult {
  return { ...text(body), isError: true };
}

/** 공백·대소문자를 무시하고 비교하기 위한 키 */
const key = (value: string) => value.replace(/\s+/g, "").toLocaleLowerCase("ko");

/**
 * 후보 중 하나를 고른다: 정확히 일치하면 그것을, 아니면 부분 일치가 하나뿐일 때 그것을 쓴다.
 * 부분 일치가 여러 개거나 없으면 match 없이 후보 목록을 돌려준다.
 */
function pickOne(query: string, candidates: string[]) {
  const q = key(query);
  const exact = candidates.find((c) => key(c) === q);
  if (exact) return { match: exact, partial: [exact] };
  const partial = candidates.filter((c) => key(c).includes(q));
  return { match: partial.length === 1 ? partial[0] : undefined, partial };
}

function sumBy(rows: Row[], index: 1 | 2 | 3) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r[index], (map.get(r[index]) || 0) + r[4]);
  return [...map].sort((a, b) => b[1] - a[1]);
}

type Institution = {
  name: string;
  total: number;
  variants: Map<string, number>;
  rows: Row[];
};

/** 원본 기관명을 학교 단위로 묶어 합산한다 (대시보드 aggregateSchools와 같은 기준). */
function aggregateInstitutions(rows: Row[]) {
  const map = new Map<string, Institution>();
  for (const r of rows) {
    const name = resolveHigherEducationInstitution(r[0]);
    if (!name) continue;
    const item: Institution = map.get(name) || { name, total: 0, variants: new Map(), rows: [] };
    item.total += r[4];
    item.variants.set(r[0], (item.variants.get(r[0]) || 0) + r[4]);
    item.rows.push(r);
    map.set(name, item);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** 체류자격·국가 필터 값을 원본 값으로 해석한다. 실패하면 사용자에게 보여줄 안내 문구를 돌려준다. */
function resolveFilter(label: string, query: string | undefined, values: string[]) {
  if (!query) return { value: undefined };
  const { match, partial } = pickOne(query, values);
  if (match) return { value: match };
  const hint = partial.length
    ? `여러 ${label}에 해당합니다: ${partial.join(", ")}. 하나를 정확히 지정해 주세요.`
    : `일치하는 ${label}이(가) 없습니다. 사용할 수 있는 값: ${values.join(", ")}`;
  return { error: `"${query}" — ${hint}` };
}

function mojHeader(data: MojDataset) {
  return `출처: ${MOJ_SOURCE} · 기준일 ${data.meta.asOf}`;
}

async function withErrors(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return errorText(`데이터를 불러오지 못했습니다: ${reason}. 잠시 후 다시 시도해 주세요.`);
  }
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_overview",
      {
        title: "유학생 현황 개요",
        description:
          "법무부 유학생관리정보의 기준일, 전체 유학생 수, 체류자격 목록(체류자격별 인원)과 교육부 연도별 자료의 수록 범위를 보여줍니다. rank_institutions의 체류자격 필터 값을 확인할 때도 쓰세요.",
        annotations: { title: "유학생 현황 개요", ...READ_ONLY },
      },
      () =>
        withErrors(async () => {
          const [data, moe] = await Promise.all([getMojDataset(), getMoeYearly()]);
          const institutions = aggregateInstitutions(data.rows);
          const higherEdTotal = institutions.reduce((sum, i) => sum + i.total, 0);
          const higherEdRows = institutions.flatMap((i) => i.rows);
          const higherEdByStatus = new Map(sumBy(higherEdRows, 2));
          const statuses = orderStatuses(sumBy(data.rows, 2));
          const latest = moe.series[moe.series.length - 1];

          return text(
            [
              `## 법무부 유학생 현황 개요`,
              mojHeader(data),
              "",
              `- 전체 유학생(원자료): ${n(data.meta.total)}명`,
              `- 고등교육기관으로 분류된 유학생: ${n(higherEdTotal)}명 (${n(institutions.length)}개 기관, 학교 단위 합산)`,
              `- 출신 국가: ${n(sumBy(data.rows, 1).length)}개국`,
              `- 체류자격: ${n(statuses.length)}종`,
              "",
              "### 체류자격 목록",
              table(
                ["체류자격", "전체(원자료)", "비율", "고등교육기관 분류"],
                statuses.map(([name, value]) => [name, value, pct(value, data.meta.total), higherEdByStatus.get(name) || 0]),
              ),
              "",
              `## 교육부 자료`,
              `출처: ${MOE_SOURCE}`,
              `- 수록 연도: ${moe.years[0]}~${moe.years[moe.years.length - 1]}년 (${moe.years.length}개 연도)`,
              `- ${latest.year}년 전체 유학생: ${n(latest.total)}명 — 연도별 추이는 get_moe_trend로 조회하세요.`,
            ].join("\n"),
          );
        }),
    );

    server.registerTool(
      "rank_institutions",
      {
        title: "기관별 유학생 순위",
        description:
          "법무부 유학생관리정보로 고등교육기관별 유학생 수 상위 N개 순위를 보여줍니다. 캠퍼스·법인 표기는 학교 단위로 합산합니다. 체류자격(예: \"대학부설 어학원 연수\", \"학사과정\", \"석사과정\")과 국적으로 필터할 수 있으며 부분 일치(예: \"어학원\")도 됩니다.",
        inputSchema: {
          status: z
            .string()
            .optional()
            .describe("체류자격 필터. 예: 대학부설 어학원 연수, 학사과정, 석사과정, 박사과정, 전문학사과정, 교환학생. 생략하면 전체 체류자격."),
          country: z.string().optional().describe("국적 필터. 예: 베트남, 중국, 우즈베키스탄. 생략하면 전체 국적."),
          limit: z.number().int().min(1).max(100).default(10).describe("상위 몇 개 기관을 보여줄지 (1~100, 기본 10)"),
        },
        annotations: { title: "기관별 유학생 순위", ...READ_ONLY },
      },
      ({ status, country, limit }) =>
        withErrors(async () => {
          const data = await getMojDataset();
          const statusFilter = resolveFilter("체류자격", status, orderStatuses(sumBy(data.rows, 2)).map(([v]) => v));
          if (statusFilter.error) return errorText(statusFilter.error);
          const countryFilter = resolveFilter("국적", country, sumBy(data.rows, 1).map(([v]) => v));
          if (countryFilter.error) return errorText(countryFilter.error);

          const rows = data.rows.filter(
            (r) => (!statusFilter.value || r[2] === statusFilter.value) && (!countryFilter.value || r[1] === countryFilter.value),
          );
          const institutions = aggregateInstitutions(rows);
          const total = institutions.reduce((sum, i) => sum + i.total, 0);
          const unclassified = rows.reduce((sum, r) => sum + r[4], 0) - total;
          const shown = institutions.slice(0, limit);
          const filterLabel = [statusFilter.value ?? "전체 체류자격", countryFilter.value ?? "전체 국적"].join(" · ");

          if (!institutions.length) {
            return text(`${mojHeader(data)}\n\n조건(${filterLabel})에 해당하는 고등교육기관 유학생이 없습니다.`);
          }

          return text(
            [
              `## 기관별 유학생 순위 — ${filterLabel}`,
              mojHeader(data),
              "",
              `- 조건에 해당하는 고등교육기관 유학생: ${n(total)}명 (${n(institutions.length)}개 기관)`,
              unclassified > 0
                ? `- 기관명이 비어 있거나 고등교육기관으로 분류되지 않은 ${n(unclassified)}명은 순위에서 제외했습니다.`
                : "",
              "",
              table(
                ["순위", "기관명", "유학생 수", "비율", "원본 표기 수"],
                shown.map((inst, i) => [i + 1, inst.name, `${n(inst.total)}명`, pct(inst.total, total), inst.variants.size]),
              ),
              "",
              `${n(institutions.length)}개 기관 중 상위 ${n(shown.length)}개를 표시했습니다. 비율은 조건에 해당하는 고등교육기관 유학생 합계 대비입니다.`,
            ]
              .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
              .join("\n"),
          );
        }),
    );

    server.registerTool(
      "get_institution",
      {
        title: "학교별 유학생 조회",
        description:
          "학교 이름(부분 일치, 예: \"계명\", \"경희대\")으로 법무부 유학생관리정보의 학교별 유학생 수를 체류자격별로 보여줍니다. 성별, 상위 출신 국가, 학교 단위로 합산된 원본 기관명 표기(캠퍼스 등)도 함께 보여줍니다.",
        inputSchema: {
          name: z.string().min(1).describe("학교 이름 또는 그 일부. 예: 계명대학교, 계명, 연세대"),
        },
        annotations: { title: "학교별 유학생 조회", ...READ_ONLY },
      },
      ({ name }) =>
        withErrors(async () => {
          const data = await getMojDataset();
          const institutions = aggregateInstitutions(data.rows);
          const q = normalizeSchoolName(name).toLocaleLowerCase("ko");
          const resolved = resolveHigherEducationInstitution(name);
          const matches = institutions.filter(
            (inst) =>
              inst.name === resolved ||
              normalizeSchoolName(inst.name).toLocaleLowerCase("ko").includes(q) ||
              [...inst.variants.keys()].some((v) => normalizeSchoolName(v).toLocaleLowerCase("ko").includes(q)),
          );
          if (!q || !matches.length) {
            return errorText(`"${name}"와(과) 일치하는 고등교육기관이 없습니다. 학교 이름의 일부(예: "계명", "경희")로 다시 검색해 보세요.`);
          }
          // 정확히 해석되는 학교가 있으면 그 학교를 먼저, 나머지는 유학생 수 순
          matches.sort((a, b) => Number(b.name === resolved) - Number(a.name === resolved) || b.total - a.total);
          const exact = matches.find((inst) => inst.name === resolved || key(inst.name) === key(name));
          const detailed = exact ? [exact] : matches.slice(0, 3);
          const others = matches.filter((inst) => !detailed.includes(inst));
          const rankOf = new Map(institutions.map((inst, i) => [inst.name, i + 1]));

          const sections = detailed.map((inst) => {
            const statuses = orderStatuses(sumBy(inst.rows, 2));
            const countries = sumBy(inst.rows, 1);
            const genders = sumBy(inst.rows, 3);
            const variants = [...inst.variants].sort((a, b) => b[1] - a[1]);
            return [
              `## ${inst.name}`,
              `- 전체 유학생: ${n(inst.total)}명 (고등교육기관 ${n(institutions.length)}개 중 ${n(rankOf.get(inst.name) ?? 0)}위)`,
              `- 성별: ${genders.map(([g, v]) => `${g} ${n(v)}명(${pct(v, inst.total)})`).join(", ")}`,
              `- 출신 국가: ${n(countries.length)}개국 — 상위 ${Math.min(10, countries.length)}개: ${countries
                .slice(0, 10)
                .map(([c, v]) => `${c} ${n(v)}명(${pct(v, inst.total)})`)
                .join(", ")}`,
              variants.length > 1
                ? `- 학교 단위로 합산한 원본 기관명 ${variants.length}개: ${variants.map(([v, c]) => `${v} ${n(c)}명`).join(", ")}`
                : `- 원본 기관명: ${variants[0][0]}`,
              "",
              "### 체류자격별 인원",
              table(
                ["체류자격", "인원", "비율"],
                statuses.map(([status, value]) => [status, `${n(value)}명`, pct(value, inst.total)]),
              ),
            ].join("\n");
          });

          return text(
            [
              mojHeader(data),
              "",
              sections.join("\n\n"),
              others.length
                ? `\n### "${name}"와(과) 일치하는 다른 기관 ${n(others.length)}개\n${others
                    .slice(0, 20)
                    .map((inst) => `- ${inst.name}: ${n(inst.total)}명`)
                    .join("\n")}${others.length > 20 ? `\n- 외 ${n(others.length - 20)}개` : ""}\n정확한 학교 이름으로 다시 조회하면 상세 내역을 볼 수 있습니다.`
                : "",
            ].join("\n"),
          );
        }),
    );

    server.registerTool(
      "get_moe_trend",
      {
        title: "교육부 연도별 유학생 추이",
        description:
          "교육부·KEDI 고등교육기관 외국인 유학생 현황(2013~2025년, 매년 4월 1일 기준)의 연도별 추이를 보여줍니다. 아무 조건이 없으면 전체 유학생과 과정별(학사·전문학사/석사/박사/공동운영/연수과정) 인원을, school을 주면 해당 학교의 추이를, country를 주면 해당 국가 출신 유학생 추이를 보여줍니다. school과 country를 함께 주면 그 학교의 해당 국가 출신 인원 추이입니다.",
        inputSchema: {
          school: z.string().optional().describe("학교 이름 또는 그 일부. 예: 계명대학교, 경희대"),
          country: z.string().optional().describe("출신 국가. 예: 베트남, 중국, 몽골"),
          from_year: z.number().int().min(2013).max(2025).optional().describe("시작 연도 (기본 2013)"),
          to_year: z.number().int().min(2013).max(2025).optional().describe("끝 연도 (기본 2025)"),
        },
        annotations: { title: "교육부 연도별 유학생 추이", ...READ_ONLY },
      },
      ({ school, country, from_year, to_year }) =>
        withErrors(async () => {
          const yearly = await getMoeYearly();
          const from = from_year ?? yearly.years[0];
          const to = to_year ?? yearly.years[yearly.years.length - 1];
          if (from > to) return errorText(`시작 연도(${from})가 끝 연도(${to})보다 늦습니다.`);
          const inRange = (year: number) => year >= from && year <= to;
          // 원본 "대학·전문대학"은 학사·전문학사 학위과정을 묶은 값이라 대시보드와 같이 이름을 바꿔 표시한다.
          const programLabel = (program: string) => (program === "대학·전문대학" ? "학사·전문학사" : program);
          const header = `출처: ${MOE_SOURCE} · ${from}~${to}년`;

          const countryFilter = resolveFilter("국가", country, yearly.dict.countries);
          if (countryFilter.error) return errorText(countryFilter.error);
          const countryName = countryFilter.value;

          if (school) {
            const trend = await getMoeSchoolTrend();
            const schools = trend.dict.schools;
            const resolved = resolveHigherEducationInstitution(school);
            let { match, partial } = pickOne(school, schools);
            if (!match && resolved && schools.includes(resolved)) match = resolved;
            if (!match && !partial.length) {
              const q = normalizeSchoolName(school);
              partial = schools.filter((s) => normalizeSchoolName(s).includes(q));
              if (partial.length === 1) match = partial[0];
            }
            if (!match) {
              return errorText(
                partial.length
                  ? `"${school}"와(과) 일치하는 학교가 여러 개입니다: ${partial.slice(0, 30).join(", ")}${partial.length > 30 ? " 등" : ""}. 하나를 정확히 지정해 주세요.`
                  : `"${school}"와(과) 일치하는 학교가 교육부 자료에 없습니다.`,
              );
            }
            const entry = trend.bySchool[schools.indexOf(match)];
            const points = entry.years.map((year, i) => ({ year, i })).filter(({ year }) => inRange(year));
            if (!points.length) return text(`${header}\n\n${match}은(는) ${from}~${to}년 자료에 없습니다.`);

            if (countryName) {
              const countryIndex = yearly.dict.countries.indexOf(countryName);
              const values = points.map(({ year, i }) => ({
                year,
                value: entry.byCountry[i].find(([c]) => c === countryIndex)?.[1] ?? 0,
                total: entry.total[i],
              }));
              return text(
                [
                  `## ${match} — ${countryName} 출신 유학생 추이`,
                  header,
                  "",
                  table(
                    ["연도", `${countryName} 출신`, "전년 대비", "학교 전체", "학교 내 비율"],
                    values.map((v, k) => [String(v.year), `${n(v.value)}명`, change(v.value, values[k - 1]?.value), `${n(v.total)}명`, pct(v.value, v.total)]),
                  ),
                ].join("\n"),
              );
            }

            return text(
              [
                `## ${match} 유학생 추이`,
                header,
                "",
                table(
                  ["연도", "전체", "전년 대비", ...trend.programs.map(programLabel)],
                  points.map(({ year, i }, k) => [
                    String(year),
                    `${n(entry.total[i])}명`,
                    change(entry.total[i], points[k - 1] ? entry.total[points[k - 1].i] : undefined),
                    ...entry.byProgram[i],
                  ]),
                ),
                "",
                `자료에 없는 연도(설립 이전 등)는 표에서 빠집니다. 상위 출신 국가는 country를 함께 지정해 조회하세요.`,
              ].join("\n"),
            );
          }

          const series = yearly.series.filter((p) => inRange(p.year));

          if (countryName) {
            const values = series.map((p) => ({
              year: p.year,
              value: p.byCountry.find((c) => c.country === countryName)?.total ?? 0,
              total: p.total,
            }));
            return text(
              [
                `## ${countryName} 출신 유학생 추이`,
                header,
                "",
                table(
                  ["연도", "인원", "전년 대비", "전체 유학생 대비"],
                  values.map((v, k) => [String(v.year), `${n(v.value)}명`, change(v.value, values[k - 1]?.value), pct(v.value, v.total)]),
                ),
              ].join("\n"),
            );
          }

          return text(
            [
              `## 전체 유학생 추이`,
              header,
              "",
              table(
                ["연도", "전체", "전년 대비", ...MOE_PROGRAMS.map(programLabel)],
                series.map((p, k) => [
                  String(p.year),
                  `${n(p.total)}명`,
                  change(p.total, series[k - 1]?.total),
                  ...MOE_PROGRAMS.map((program) => p.byProgram.find((b) => b.program === program)?.count ?? 0),
                ]),
              ),
            ].join("\n"),
          );
        }),
    );
  },
  {
    serverInfo: { name: "kstu-datalab", version: "1.0.0" },
    instructions: INSTRUCTIONS,
  },
  { basePath: "/api", disableSse: true, maxDuration: 60 },
);

export { handler as GET, handler as POST, handler as DELETE };
