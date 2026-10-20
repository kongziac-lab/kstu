// 국가명(한국어 원본 표기) -> 6개 언어 이름 사전을 만든다.
// 브라우저(특히 Chrome)는 네팔어·몽골어·우즈베크어 국가명 데이터가 없어서,
// Node(full ICU)의 Intl.DisplayNames로 미리 뽑아 app/lib/country-names.json에 저장한다.
// 새 국가 표기가 데이터에 생기면: node scripts/gen-country-names.mjs
import { readFile, writeFile } from "node:fs/promises";

const LANGS = ["en", "zh", "vi", "ne", "mn", "uz"];

// 원본 한국어 표기 -> ISO 3166-1 alpha-2
const ISO = {
  가나: "GH", 가봉: "GA", 가이아나: "GY", 감비아: "GM", 건지: "GG", 과테말라: "GT", 괌: "GU", 교황청: "VA",
  그레나다: "GD", 그루지아: "GE", 그리스: "GR", 그린랜드: "GL", 기니: "GN", 기니비사우: "GW",
  나미비아: "NA", 나우루: "NR", 나이지리아: "NG", 남수단: "SS", 남수단공화국: "SS", 남아프리카: "ZA", 남아프리카공화국: "ZA",
  "남조지아·남샌드위치군도": "GS", 네덜란드: "NL", 네팔: "NP", 노르웨이: "NO", 뉴질랜드: "NZ", 니제르: "NE", 니카라과: "NI",
  대만: "TW", 대한민국: "KR", 덴마크: "DK", "도미니카 공화국": "DO", 도미니카공화국: "DO", 도미니카연방: "DM", 독일: "DE",
  동티모르: "TL", 동티모르민주공화국: "TL", 티모르민주공화국: "TL",
  라오스: "LA", 라이베리아: "LR", 라트비아: "LV", 러시아: "RU", "러시아(연방)": "RU", 레바논: "LB", 레소토: "LS", 레위니옹: "RE",
  루마니아: "RO", 룩셈부르크: "LU", 르완다: "RW", 리비아: "LY", 리투아니아: "LT", 리히텐슈타인: "LI",
  마다가스카르: "MG", 마다가스칼: "MG", 마샬군도: "MH", 마요티: "YT", 마이크로네시아: "FM", 마이크로네시아연방: "FM", 미이크로네시아: "FM",
  마카오: "MO", 마케도니아: "MK", "마케도니아 공화국": "MK", 북마케도니아: "MK", 말라위: "MW", 말레이시아: "MY", 말레이지아: "MY",
  말리: "ML", 말티니크: "MQ", 멕시코: "MX", 모나코: "MC", 모로코: "MA", 모리셔스: "MU", 모리타니: "MR", 모리타니아: "MR",
  모잠비크: "MZ", 몬테네그로: "ME", 몰도바: "MD", 몰디브: "MV", 몰타: "MT", 몽골: "MN", 몽고: "MN", 미국: "US",
  "미국령 버진아일랜드": "VI", "미국령 사모아": "AS", "미국령 태평양군도": "UM", 미얀마: "MM",
  바누아투: "VU", 바레인: "BH", 바베이도스: "BB", 바티칸: "VA", 바하마: "BS", 방글라데시: "BD", 버뮤다: "BM", 베냉: "BJ",
  베네수엘라: "VE", 베트남: "VN", 벨기에: "BE", 벨라루스: "BY", 벨리즈: "BZ",
  "보스니아 헤르체고비나": "BA", "보스니아-헤르체고비나": "BA", 보스니아헤르체고비나: "BA", 보츠와나: "BW", 볼리비아: "BO",
  부룬디: "BI", 부르키나파소: "BF", "부르키나 파소": "BF", 부탄: "BT", "북마리아나 군도": "MP", 북마리아나군도: "MP", 북한: "KP",
  불가리아: "BG", 브라질: "BR", 브루나이: "BN",
  사모아: "WS", 서사모아: "WS", 사우디아라비아: "SA", "사우스조지아 사우스샌드위치 제도": "GS", 사이프러스: "CY", 키프로스: "CY",
  산마리노: "SM", 서사하라: "EH", 세네갈: "SN", 세르비아: "RS", 세인트루시아: "LC", "세인트 루시아": "LC",
  "세인트 빈센트 그레나딘": "VC", "세인트 키츠 네비스": "KN", "세인트 킷츠 네비스": "KN", 소말리아: "SO",
  솔로몬: "SB", 솔로몬군도: "SB", 솔로몬제도: "SB", 수단: "SD", 수리남: "SR", 스리랑카: "LK", 스와질랜드: "SZ", 에스와티니: "SZ",
  스웨덴: "SE", 스위스: "CH", 스페인: "ES", 슬로바크: "SK", 슬로바키아: "SK", 슬로베니아: "SI", 시리아: "SY", 시에라리온: "SL", 싱가포르: "SG",
  아랍에미리트연합: "AE", 아랍에미레이트: "AE", 아랍에미리트: "AE", 아르메니아: "AM", 아르헨티나: "AR", 아이랜드: "IE", 아일랜드: "IE",
  아이보리코스트: "CI", 코트디부아르: "CI", 코트디브아르: "CI", 아이슬란드: "IS", 아이티: "HT", 아제르바이잔: "AZ", 아프가니스탄: "AF",
  안길라: "AI", 안도라: "AD", 알바니아: "AL", 알제리: "DZ", 앙골라: "AO", "앤티가 바부다": "AG", 엔티가바부다: "AG",
  에리트레아: "ER", 에리트리아: "ER", 엘리트리아: "ER", 에스토니아: "EE", 에콰도르: "EC", 에티오피아: "ET", 엘살바도르: "SV",
  영국: "GB", "영국령 버진아일랜드": "VG", "영국령 인도양 지역": "IO", 예멘: "YE", 예멘공화국: "YE", 오만: "OM",
  오스트레일리아: "AU", 호주: "AU", 오스트리아: "AT", 온두라스: "HN", 요르단: "JO", 우간다: "UG", 우루과이: "UY",
  우즈베키스탄: "UZ", 우크라이나: "UA", 우크라이나공화국: "UA", 이라크: "IQ", 이란: "IR", 이스라엘: "IL", 이집트: "EG",
  이탈리아: "IT", 인도: "IN", 인도네시아: "ID", 일본: "JP",
  자메이카: "JM", 자이르: "CD", 잠비아: "ZM", 저지: "JE", 적도기니: "GQ", "적도 기니": "GQ", 조지아: "GE",
  중국: "CN", 중앙아프리카: "CF", 중앙아프리카공화국: "CF", 지부티: "DJ", 짐바브웨: "ZW",
  차드: "TD", 체코: "CZ", 칠레: "CL",
  카메룬: "CM", 카자흐스탄: "KZ", 카쟈흐스탄: "KZ", 카타르: "QA", 캄보디아: "KH", 캐나다: "CA", 케냐: "KE",
  코모로: "KM", 코소보: "XK", 코스타리카: "CR", 콜롬비아: "CO", 콩고: "CG", 콩고공화국: "CG", 콩고민주공화국: "CD",
  쿠바: "CU", 쿠웨이트: "KW", 크로아티아: "HR", 키르기즈: "KG", 키르기스스탄: "KG", 키르기즈스탄: "KG", 키리바시: "KI",
  타이: "TH", 태국: "TH", 타이완: "TW", 타지키스탄: "TJ", 탄자니아: "TZ", 튀르키예: "TR", 터키: "TR", 터어키: "TR",
  "터크스 케이커스 제도": "TC", 토고: "TG", 통가: "TO", 투르크메니스탄: "TM", 투발루: "TV", 튀니지: "TN",
  트리니다드토바고: "TT", "트리니다드·토바고": "TT",
  파나마: "PA", 파라과이: "PY", 파로에군도: "FO", 페로제도: "FO", 파키스탄: "PK", 파퓨아뉴기니: "PG", 파푸아뉴기니: "PG",
  팔라우: "PW", 팔레스타인: "PS", 페루: "PE", 포르투갈: "PT", "포클랜드(말비나스)군도": "FK", 폴란드: "PL",
  푸에르토리코: "PR", 푸에토리코: "PR", 프랑스: "FR", "프랑스 메트로폴리탄": "FR", "프랑스 본국": "FR",
  "프랑스령 극남군도": "TF", "프랑스령 남방 및 남극": "TF", "프랑스령 폴리네시아": "PF",
  벨로루시: "BY", 세인트빈센트그레나딘: "VC", 세인트크리스토퍼네비스: "KN", 카보베르데: "CV",
  피지: "FJ", 핀란드: "FI", 필리핀: "PH", 헝가리: "HU", 홍콩: "HK",
};

// ISO 코드가 없거나 의미가 특수한 표기
const SPECIAL = {
  미상: { en: "Unknown", zh: "未详", vi: "Không rõ", ne: "अज्ञात", mn: "Тодорхойгүй", uz: "Nomaʼlum" },
  무국적: { en: "Stateless", zh: "无国籍", vi: "Không quốc tịch", ne: "राज्यविहीन", mn: "Харьяалалгүй", uz: "Fuqaroligi yoʻq" },
  국적불명: { en: "Unknown nationality", zh: "国籍不明", vi: "Không rõ quốc tịch", ne: "राष्ट्रियता अज्ञात", mn: "Харьяалал тодорхойгүй", uz: "Fuqaroligi nomaʼlum" },
  협약난민: { en: "Convention refugee", zh: "公约难民", vi: "Người tị nạn theo Công ước", ne: "महासन्धि शरणार्थी", mn: "Конвенцийн дүрвэгч", uz: "Konvensiya qochqini" },
  영국외지민: { en: "British Overseas Citizen", zh: "英国海外公民", vi: "Công dân Hải ngoại Anh", ne: "ब्रिटिश ओभरसिज नागरिक", mn: "Их Британийн гадаад иргэн", uz: "Britaniya xorijiy fuqarosi" },
  영국해외영토시민: { en: "British Overseas Territories Citizen", zh: "英国海外领土公民", vi: "Công dân Lãnh thổ Hải ngoại Anh", ne: "ब्रिटिश ओभरसिज टेरिटोरिज नागरिक", mn: "Их Британийн хилийн чанад дахь нутаг дэвсгэрийн иргэн", uz: "Britaniya xorijiy hududlari fuqarosi" },
  "네덜란드령 안틸레스": { en: "Netherlands Antilles", zh: "荷属安的列斯", vi: "Antille thuộc Hà Lan", ne: "नेदरल्यान्ड्स एन्टिलिस", mn: "Нидерландын Антилийн арлууд", uz: "Niderlandiya Antil orollari" },
  "세르비아-몬테네그로": { en: "Serbia and Montenegro", zh: "塞尔维亚和黑山", vi: "Serbia và Montenegro", ne: "सर्बिया र मोन्टेनेग्रो", mn: "Серби ба Монтенегро", uz: "Serbiya va Chernogoriya" },
  유고슬라비아: { en: "Yugoslavia", zh: "南斯拉夫", vi: "Nam Tư", ne: "युगोस्लाभिया", mn: "Югослав", uz: "Yugoslaviya" },
  미등록국가: { en: "Unregistered country", zh: "未登记国家", vi: "Quốc gia chưa đăng ký", ne: "दर्ता नभएको देश", mn: "Бүртгэлгүй улс", uz: "Roʻyxatga olinmagan davlat" },
  홍콩거주난민: { en: "Refugee resident in Hong Kong", zh: "居港难民", vi: "Người tị nạn cư trú tại Hồng Kông", ne: "हङकङ बसोबास गर्ने शरणार्थी", mn: "Хонг Конгод оршин суугаа дүрвэгч", uz: "Gonkongda yashovchi qochqin" },
  티벳: { en: "Tibet", zh: "西藏", vi: "Tây Tạng", ne: "तिब्बत", mn: "Төвд", uz: "Tibet" },
  한국계중국인: { en: "Ethnic Korean (China)", zh: "中国朝鲜族", vi: "Người gốc Hàn (Trung Quốc)", ne: "कोरियाली मूलका (चीन)", mn: "Солонгос гаралтай (Хятад)", uz: "Koreys millatli (Xitoy)" },
  한국계러시아인: { en: "Ethnic Korean (Russia)", zh: "俄罗斯高丽人", vi: "Người gốc Hàn (Nga)", ne: "कोरियाली मूलका (रुस)", mn: "Солонгос гаралтай (Орос)", uz: "Koreys millatli (Rossiya)" },
};

// "재OO동포" = OO 거주 재외동포
const DIASPORA = {
  en: (c) => `Overseas Korean (${c})`,
  zh: (c) => `${c}韩侨`,
  vi: (c) => `Kiều bào Hàn (${c})`,
  ne: (c) => `प्रवासी कोरियाली (${c})`,
  mn: (c) => `Гадаад дахь солонгос (${c})`,
  uz: (c) => `Xorijdagi koreys (${c})`,
};

const display = Object.fromEntries(LANGS.map((l) => [l, new Intl.DisplayNames([l], { type: "region" })]));
// CLDR 기본 이름에 붙는 괄호 별칭을 정리한다(예: "Myanmar (Burma)").
const clean = (s) => s.replace(/\s*[(（][^)）]*[)）]\s*$/, "");
// CLDR 기본 이름이 길거나 모호한 코드는 직접 정한다.
const ISO_OVERRIDE = {
  CD: { en: "DR Congo", zh: "刚果（金）", vi: "CHDC Congo", ne: "प्रजातान्त्रिक गणतन्त्र कङ्गो", mn: "АБН Конго", uz: "Kongo DR" },
  CG: { en: "Republic of the Congo", zh: "刚果（布）", vi: "Cộng hòa Congo", ne: "कङ्गो गणतन्त्र", mn: "БН Конго", uz: "Kongo Respublikasi" },
  HK: { en: "Hong Kong", zh: "香港", vi: "Hồng Kông", ne: "हङकङ", mn: "Хонг Конг", uz: "Gonkong" },
  MO: { en: "Macao", zh: "澳门", vi: "Ma Cao", ne: "मकाउ", mn: "Макао", uz: "Makao" },
};
const fromIso = (code) => ISO_OVERRIDE[code] ?? Object.fromEntries(LANGS.map((l) => [l, clean(display[l].of(code))]));

const yearly = JSON.parse(await readFile(new URL("../public/moe-yearly.json", import.meta.url), "utf8"));
const moj = JSON.parse(await readFile(new URL("../public/student-data.json", import.meta.url), "utf8"));
const trend = JSON.parse(await readFile(new URL("../public/trend-data.json", import.meta.url), "utf8"));
const names = new Set([
  ...yearly.dict.countries,
  ...moj.rows.map((r) => r[1]),
  ...trend.series.flatMap((p) => p.country.map((c) => c.country)),
  ...Object.keys(ISO),
  ...Object.keys(SPECIAL),
]);

const out = {};
const missing = [];
for (const raw of [...names].sort((a, b) => a.localeCompare(b, "ko"))) {
  const name = raw.trim();
  if (SPECIAL[name]) { out[raw] = SPECIAL[name]; continue; }
  if (ISO[name]) { out[raw] = fromIso(ISO[name]); continue; }
  const m = name.match(/^재(.+)동포$/);
  if (m && ISO[m[1]]) {
    const base = fromIso(ISO[m[1]]);
    out[raw] = Object.fromEntries(LANGS.map((l) => [l, DIASPORA[l](base[l])]));
    continue;
  }
  missing.push(raw);
}

await writeFile(new URL("../app/lib/country-names.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`country-names.json: ${Object.keys(out).length}개`);
if (missing.length) {
  console.log("번역 없음(한국어 그대로 표시):", missing);
  process.exitCode = 0;
}
