// 학교명 정규화·표준화 및 고등교육기관 여부 판별.
// 법무부(체류자격 기준) / 교육부(학위과정 기준) 두 데이터 소스가 원본 학교명 표기가
// 서로 다르게 흔들리므로(법인/재단/캠퍼스 표기, 국립 접두사 등), 두 소스 모두 이
// 모듈의 함수로 정규화한 뒤 같은 고등교육기관명으로 묶는다.
import { HIGHER_EDUCATION_INSTITUTIONS } from "../higher-education-institutions";

const EXCELLENT_CERTIFIED_SCHOOLS = `
건국대학교, 건양대학교, 경북대학교, 경성대학교, 경희대학교, 계명대학교, 고려대학교, 단국대학교, 덕성여자대학교, 동국대학교, 부산대학교, 부산외국어대학교, 서경대학교, 서울시립대학교, 서울신학대학교, 서울여자대학교, 선문대학교, 성결대학교, 성균관대학교, 성신여자대학교, 세종대학교, 숙명여자대학교, 아주대학교, 울산과학기술원, 이화여자대학교, 인하대학교, 제주대학교, 중부대학교, 중앙대학교, 충남대학교, 포항공과대학교, 한국항공대학교, 한성대학교, 한양대학교, 홍익대학교, 경복대학교, 울산과학대학교, 인하공업전문대학, 개신대학원대학교, 과학기술연합대학원대학교, 국립암센터국제암대학원대학교, 한국개발연구원국제정책대학원대학교, 한국전력국제원자력대학원대학교
`;

const CERTIFIED_SCHOOLS = `
가천대학교, 가톨릭대학교, 강남대학교, 강서대학교, 강원대학교, 건국대학교, 건양대학교, 경기대학교, 경남대학교, 경동대학교, 경북대학교, 경상국립대학교, 경성대학교, 경운대학교, 경일대학교, 경희대학교, 계명대학교, 고려대학교, 고신대학교, 광운대학교, 광주과학기술원, 광주대학교, 광주여자대학교, 국립경국대학교, 국립공주대학교, 국립군산대학교, 국립금오공과대학교, 국립목포대학교, 국립부경대학교, 국립순천대학교, 국립창원대학교, 국립한국교통대학교, 국립한국해양대학교, 국립한밭대학교, 국민대학교, 김천대학교, 나사렛대학교, 남서울대학교, 단국대학교, 대구가톨릭대학교, 대구대학교, 대구한의대학교, 대신대학교, 대전대학교, 대진대학교, 덕성여자대학교, 동국대학교, 동덕여자대학교, 동명대학교, 동서대학교, 동신대학교, 동아대학교, 동의대학교, 명지대학교, 목원대학교, 배재대학교, 백석대학교, 부산대학교, 부산외국어대학교, 삼육대학교, 상명대학교, 서강대학교, 서경대학교, 서울과학기술대학교, 서울기독대학교, 서울대학교, 서울시립대학교, 서울신학대학교, 서울여자대학교, 선문대학교, 성결대학교, 성공회대학교, 성균관대학교, 성신여자대학교, 세명대학교, 세종대학교, 숙명여자대학교, 순천향대학교, 숭실대학교, 신라대학교, 신한대학교, 아주대학교, 안양대학교, 연세대학교, 영남대학교, 영산대학교, 우석대학교, 우송대학교, 울산과학기술원, 울산대학교, 원광대학교, 위덕대학교, 을지대학교, 이화여자대학교, 인제대학교, 인천대학교, 인하대학교, 전남대학교, 전북대학교, 전주대학교, 제주대학교, 조선대학교, 중부대학교, 중앙대학교, 중원대학교, 차의과학대학교, 창신대학교, 청주대학교, 충남대학교, 충북대학교, 평택대학교, 포항공과대학교, 한국과학기술원, 한국교원대학교, 한국기술교육대학교, 한국성서대학교, 한국외국어대학교, 한국항공대학교, 한남대학교, 한동대학교, 한림대학교, 한서대학교, 한성대학교, 한세대학교, 한양대학교, 호서대학교, 홍익대학교, 경남도립거창대학, 경남정보대학교, 경복대학교, 경인여자대학교, 계명문화대학교, 군장대학교, 대림대학교, 동원과학기술대학교, 동원대학교, 동의과학대학교, 명지전문대학, 목포과학대학교, 부산과학기술대학교, 부천대학교, 서울예술대학교, 서정대학교, 안산대학교, 영남이공대학교, 영진전문대학교, 오산대학교, 용인예술과학대학교, 울산과학대학교, 원광보건대학교, 인덕대학교, 인하공업전문대학, 장안대학교, 전북과학대학교, 전주비전대학교, 제주관광대학교, 제주한라대학교, 한국영상대학교, 한양여자대학교, 개신대학원대학교, 과학기술연합대학원대학교, 국립암센터국제암대학원대학교, 국제언어대학원대학교, 동방문화대학원대학교, 서울과학종합대학원대학교, 서울미디어대학원대학교, 서울외국어대학원대학교, 선학유피대학원대학교, 수도국제대학원대학교, 예명대학원대학교, 온석대학원대학교, 한국개발연구원국제정책대학원대학교, 한국전력국제원자력대학원대학교, 한국학중앙연구원 한국학대학원, 횃불트리니티신학대학원대학교
`;

export function normalizeSchoolName(name: string) {
  return name
    .replace(/\([^)]*\)/g, "")
    .replace(/^국립대학법인\s*/g, "")
    .replace(/^국립\s*/g, "")
    // 법인/재단/학원 접두사 + 뒤따르는 임의의 학원명을 제거해 실제 학교명만 남김
    // 예: (학)인천가톨릭학원 가톨릭관동대학교 -> 가톨릭관동대학교
    .replace(/^(?:\(학\)|재단법인|\(재\)|학교법인|사립학교법인|학원)\s*/g, "")
    .replace(/^(?:[가-힣]+학원|[가-힣]+대학법인|[가-힣]+학술재단)\s+/g, "")
    .replace(/캠퍼스/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function standardizeSchoolName(name: string) {
  if (name === "미상") return name;
  return name
    .trim()
    .replace(/^\(학\)\s*/g, "")
    .replace(/^학교법인\s+/g, "")
    .replace(/^국립대학법인\s+/g, "")
    .replace(/^국립\s*(?=.*(?:대학교|대학|과학기술원|교육대학교))/g, "")
    .replace(/대학교.+캠퍼스$/g, "대학교")
    .replace(/(대학교|대학)\s+.+캠퍼스$/g, "$1")
    .replace(/\s+/g, " ");
}

const higherEducationInstitutionMap = new Map<string, string>();

HIGHER_EDUCATION_INSTITUTIONS.split(",").forEach((value) => {
  const name = value.trim();
  const key = normalizeSchoolName(name);
  if (key && !higherEducationInstitutionMap.has(key)) {
    higherEducationInstitutionMap.set(key, standardizeSchoolName(name));
  }
});

const higherEducationInstitutionPrefixes = [...higherEducationInstitutionMap.keys()]
  .sort((a, b) => b.length - a.length)
  .reduce((map, key) => {
    const initial = key[0];
    const keys = map.get(initial) || [];
    keys.push(key);
    map.set(initial, keys);
    return map;
  }, new Map<string, string[]>());

export function resolveHigherEducationInstitution(rawName: string) {
  const normalized = normalizeSchoolName(rawName);
  if (!normalized || normalized === "미상") return null;

  const exact = higherEducationInstitutionMap.get(normalized);
  if (exact) return exact;

  if (normalized.endsWith("대학")) {
    const renamed = higherEducationInstitutionMap.get(`${normalized}교`);
    if (renamed) return renamed;
  }

  const matchingPrefix = (higherEducationInstitutionPrefixes.get(normalized[0]) || [])
    .find((key) => normalized.startsWith(key));
  return matchingPrefix ? higherEducationInstitutionMap.get(matchingPrefix) || null : null;
}

const excellentCertifiedSet = new Set(
  EXCELLENT_CERTIFIED_SCHOOLS.split(",").map(normalizeSchoolName).filter(Boolean)
);

const certifiedSet = new Set(
  CERTIFIED_SCHOOLS.split(",").map(normalizeSchoolName).filter(Boolean)
);

export function getCertification(name: string) {
  const normalized = normalizeSchoolName(name);
  if (excellentCertifiedSet.has(normalized)) return "우수";
  if (certifiedSet.has(normalized)) return "일반";
  return null;
}
