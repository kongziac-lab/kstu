// 법무부 체류자격 표시 순서 — 대시보드(MojBody)와 MCP 서버가 공유한다.
export const STATUS_ORDER = [
  "학사과정",
  "석사과정",
  "박사과정",
  "전문학사과정",
  "교환학생",
  "대학부설 어학원 연수",
  "학술연구기관 특정연구자",
  "(구)교환학생",
  "외국어연수생",
];

export function orderStatuses<T>(items: [string, T][]) {
  const order = new Map(STATUS_ORDER.map((name, index) => [name, index]));
  return [...items].sort((a, b) =>
    (order.get(a[0]) ?? STATUS_ORDER.length) -
    (order.get(b[0]) ?? STATUS_ORDER.length)
  );
}
