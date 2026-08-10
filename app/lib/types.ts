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

/** rows: [schoolDictIndex, countryDictIndex, total][] — public/moe-cross-{year}.json */
export type MoeCross = { year: number; rows: [number, number, number][] };

export type DataSource = "moj" | "moe";
