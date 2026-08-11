// 두 데이터 소스(법무부 OpenAPI / 교육부·KEDI 엑셀)가 공유하거나 각자 사용하는 타입.

// --- 법무부 유학생관리정보 (반기, 2019~) ---
export type Row = [string, string, string, string, number];
export type Dataset = { meta: { asOf: string; total: number }; rows: Row[] };
export type TrendPoint = {
  asOf: string;
  total: number;
  schools: { name: string; count: number }[];
  status: { school: string; status: string; count: number }[];
  country: { school: string; country: string; count: number }[];
};
export type TrendSeries = { series: TrendPoint[] };
export type SchoolAggregate = { name: string; value: number; variants: { name: string; value: number }[] };

// --- 교육부/KEDI 고등교육기관 외국인 유학생 현황 (연 1회 4월 1일 기준, 2013~2025) ---
export type MoeProgramCount = { program: string; count: number };
export type MoeFieldCount = { program: string; field: string; count: number };
export type MoeTrainingCount = { type: string; count: number };
export type MoeCountryCount = { country: string; total: number };
export type MoeSchoolCount = { school: string; total: number };
export type MoeRegionCount = { region: string; total: number };
export type MoeFoundingCount = { founding: string; total: number };
export type MoeSchoolTypeCount = { type: string; total: number };

export type MoeYearPoint = {
  year: number;
  total: number;
  byProgram: MoeProgramCount[];
  byField: MoeFieldCount[];
  byTraining: MoeTrainingCount[];
  byCountry: MoeCountryCount[];
  bySchool: MoeSchoolCount[];
  byRegion: MoeRegionCount[];
  byFounding: MoeFoundingCount[];
  bySchoolType: MoeSchoolTypeCount[];
};

export type MoeYearly = {
  generatedAt: string;
  years: number[];
  dict: { countries: string[]; schools: string[] };
  series: MoeYearPoint[];
};

export type MoeSchoolDetail = {
  total: number;
  /** 원본 표기가 2개 이상 병합된 경우에만 존재 (법무부 "원본 내역"과 동일한 개념) */
  variants?: { name: string; total: number }[];
  byProgram: MoeProgramCount[];
  byField: MoeFieldCount[];
  byTraining: MoeTrainingCount[];
};

/**
 * public/moe-cross-{year}.json — 학교 선택 시에만 지연 로딩되는 연도별 상세 데이터.
 * rows: [schoolDictIndex, countryDictIndex, total][] (학교x국가 교차표)
 * schools: schoolDictIndex(문자열 키) -> 해당 학교의 그 해 상세 집계
 */
export type MoeCross = {
  year: number;
  rows: [number, number, number][];
  schools: Record<number, MoeSchoolDetail>;
};

export type DataSource = "moj" | "moe";
