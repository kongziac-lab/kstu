// 데이터에 실린 한국어 값(국가·체류자격·과정·전공계열·지역·설립·학제·성별)을
// 화면 언어로 바꾼다. 데이터 조회 키는 계속 한국어 원본을 쓰고, 표시할 때만 이 함수를 거친다.
// 대학 이름은 공식 영문명을 확인하지 못한 곳이 많아 원본(한국어) 그대로 둔다.
import countryNames from "./country-names.json";
import type { Lang } from "./i18n";

type Foreign = Exclude<Lang, "ko">;
type Names = Record<Foreign, string>;

const COUNTRY = countryNames as Record<string, Names>;

// 법무부 체류자격(+ 시계열에만 있는 값). 외국어에는 사증 세부 코드를 붙인다.
const STATUS: Record<string, Names> = {
  학사과정: { en: "Bachelor's (D-2-2)", zh: "本科 (D-2-2)", vi: "Đại học (D-2-2)", ne: "स्नातक (D-2-2)", mn: "Бакалавр (D-2-2)", uz: "Bakalavriat (D-2-2)" },
  석사과정: { en: "Master's (D-2-3)", zh: "硕士 (D-2-3)", vi: "Thạc sĩ (D-2-3)", ne: "स्नातकोत्तर (D-2-3)", mn: "Магистр (D-2-3)", uz: "Magistratura (D-2-3)" },
  박사과정: { en: "Doctoral (D-2-4)", zh: "博士 (D-2-4)", vi: "Tiến sĩ (D-2-4)", ne: "विद्यावारिधि (D-2-4)", mn: "Доктор (D-2-4)", uz: "Doktorantura (D-2-4)" },
  전문학사과정: { en: "Associate degree (D-2-1)", zh: "专科 (D-2-1)", vi: "Cao đẳng (D-2-1)", ne: "एसोसिएट डिग्री (D-2-1)", mn: "Коллеж (D-2-1)", uz: "Kollej (D-2-1)" },
  교환학생: { en: "Exchange student (D-2-6)", zh: "交换生 (D-2-6)", vi: "Sinh viên trao đổi (D-2-6)", ne: "आदानप्रदान विद्यार्थी (D-2-6)", mn: "Солилцооны оюутан (D-2-6)", uz: "Almashinuv talabasi (D-2-6)" },
  "대학부설 어학원 연수": { en: "University language program (D-4-1)", zh: "大学附属语学院研修 (D-4-1)", vi: "Học tiếng tại trường đại học (D-4-1)", ne: "विश्वविद्यालय भाषा कार्यक्रम (D-4-1)", mn: "Их сургуулийн хэлний бэлтгэл (D-4-1)", uz: "Universitet til kursi (D-4-1)" },
  "학술연구기관 특정연구자": { en: "Research institute researcher (D-2-5)", zh: "学术研究机构特定研究员 (D-2-5)", vi: "Nghiên cứu viên viện nghiên cứu (D-2-5)", ne: "अनुसन्धान संस्थाका अनुसन्धानकर्ता (D-2-5)", mn: "Судалгааны байгууллагын судлаач (D-2-5)", uz: "Ilmiy muassasa tadqiqotchisi (D-2-5)" },
  "(구)교환학생": { en: "Exchange student (old code)", zh: "交换生（旧）", vi: "Sinh viên trao đổi (mã cũ)", ne: "आदानप्रदान विद्यार्थी (पुरानो कोड)", mn: "Солилцооны оюутан (хуучин код)", uz: "Almashinuv talabasi (eski kod)" },
  외국어연수생: { en: "Foreign language trainee (D-4-7)", zh: "外语研修生 (D-4-7)", vi: "Học viên ngoại ngữ (D-4-7)", ne: "विदेशी भाषा प्रशिक्षार्थी (D-4-7)", mn: "Гадаад хэлний суралцагч (D-4-7)", uz: "Chet tili tinglovchisi (D-4-7)" },
  "시간제 아르바이트": { en: "Part-time work", zh: "兼职打工", vi: "Làm thêm bán thời gian", ne: "आंशिक समय काम", mn: "Цагийн ажил", uz: "Yarim kunlik ish" },
};

// 교육부 과정 유형(화면 표기 기준)
const PROGRAM: Record<string, Names> = {
  "학사·전문학사": { en: "Bachelor's & associate", zh: "本科·专科", vi: "Đại học & cao đẳng", ne: "स्नातक र एसोसिएट", mn: "Бакалавр ба коллеж", uz: "Bakalavr va kollej" },
  석사과정: { en: "Master's", zh: "硕士", vi: "Thạc sĩ", ne: "स्नातकोत्तर", mn: "Магистр", uz: "Magistratura" },
  박사과정: { en: "Doctoral", zh: "博士", vi: "Tiến sĩ", ne: "विद्यावारिधि", mn: "Доктор", uz: "Doktorantura" },
  공동운영: { en: "Joint program", zh: "联合培养", vi: "Chương trình liên kết", ne: "संयुक्त कार्यक्रम", mn: "Хамтарсан хөтөлбөр", uz: "Qoʻshma dastur" },
  연수과정: { en: "Non-degree training", zh: "研修课程", vi: "Khóa đào tạo không cấp bằng", ne: "गैर-डिग्री तालिम", mn: "Зэрэггүй сургалт", uz: "Darajasiz oʻqish" },
};

const FIELD: Record<string, Names> = {
  인문사회: { en: "Humanities & social sciences", zh: "人文社会", vi: "Nhân văn - Xã hội", ne: "मानविकी र सामाजिक विज्ञान", mn: "Хүмүүнлэг, нийгэм", uz: "Gumanitar va ijtimoiy fanlar" },
  공학: { en: "Engineering", zh: "工学", vi: "Kỹ thuật", ne: "इन्जिनियरिङ", mn: "Инженерчлэл", uz: "Muhandislik" },
  자연: { en: "Natural sciences", zh: "自然科学", vi: "Khoa học tự nhiên", ne: "प्राकृतिक विज्ञान", mn: "Байгалийн ухаан", uz: "Tabiiy fanlar" },
  의학: { en: "Medicine", zh: "医学", vi: "Y học", ne: "चिकित्सा", mn: "Анагаах ухаан", uz: "Tibbiyot" },
  예체능: { en: "Arts & sports", zh: "艺体", vi: "Nghệ thuật & thể thao", ne: "कला र खेलकुद", mn: "Урлаг, спорт", uz: "Sanʼat va sport" },
};

const REGION: Record<string, Names> = {
  서울: { en: "Seoul", zh: "首尔", vi: "Seoul", ne: "सिओल", mn: "Сөүл", uz: "Seul" },
  경기: { en: "Gyeonggi", zh: "京畿", vi: "Gyeonggi", ne: "ग्योङ्गी", mn: "Кёнги", uz: "Gyeonggi" },
  부산: { en: "Busan", zh: "釜山", vi: "Busan", ne: "बुसान", mn: "Пусан", uz: "Pusan" },
  대전: { en: "Daejeon", zh: "大田", vi: "Daejeon", ne: "देजन", mn: "Тэжон", uz: "Tejon" },
  충남: { en: "South Chungcheong", zh: "忠清南道", vi: "Chungcheong Nam", ne: "दक्षिण चुङ्चङ", mn: "Өмнөд Чүнчон", uz: "Janubiy Chungcheong" },
  경북: { en: "North Gyeongsang", zh: "庆尚北道", vi: "Gyeongsang Bắc", ne: "उत्तर ग्योङ्साङ", mn: "Хойд Кёнсан", uz: "Shimoliy Gyeongsang" },
  대구: { en: "Daegu", zh: "大邱", vi: "Daegu", ne: "देगु", mn: "Тэгү", uz: "Tegu" },
  전북: { en: "North Jeolla", zh: "全罗北道", vi: "Jeolla Bắc", ne: "उत्तर जोल्ला", mn: "Хойд Чолла", uz: "Shimoliy Jeolla" },
  광주: { en: "Gwangju", zh: "光州", vi: "Gwangju", ne: "ग्वाङ्जु", mn: "Кванжу", uz: "Kvanju" },
  충북: { en: "North Chungcheong", zh: "忠清北道", vi: "Chungcheong Bắc", ne: "उत्तर चुङ्चङ", mn: "Хойд Чүнчон", uz: "Shimoliy Chungcheong" },
  강원: { en: "Gangwon", zh: "江原", vi: "Gangwon", ne: "गाङ्वन", mn: "Канвон", uz: "Kanvon" },
  경남: { en: "South Gyeongsang", zh: "庆尚南道", vi: "Gyeongsang Nam", ne: "दक्षिण ग्योङ्साङ", mn: "Өмнөд Кёнсан", uz: "Janubiy Gyeongsang" },
  인천: { en: "Incheon", zh: "仁川", vi: "Incheon", ne: "इन्चन", mn: "Инчон", uz: "Inchxon" },
  전남: { en: "South Jeolla", zh: "全罗南道", vi: "Jeolla Nam", ne: "दक्षिण जोल्ला", mn: "Өмнөд Чолла", uz: "Janubiy Jeolla" },
  제주: { en: "Jeju", zh: "济州", vi: "Jeju", ne: "जेजु", mn: "Жэжү", uz: "Chejudo" },
  울산: { en: "Ulsan", zh: "蔚山", vi: "Ulsan", ne: "उल्सान", mn: "Ульсан", uz: "Ulsan" },
  세종: { en: "Sejong", zh: "世宗", vi: "Sejong", ne: "सेजोङ", mn: "Сэжон", uz: "Sejong" },
};

const FOUNDING: Record<string, Names> = {
  사립: { en: "Private", zh: "私立", vi: "Tư thục", ne: "निजी", mn: "Хувийн", uz: "Xususiy" },
  국립: { en: "National", zh: "国立", vi: "Quốc lập", ne: "राष्ट्रिय", mn: "Улсын", uz: "Davlat" },
  국립대법인: { en: "National university corporation", zh: "国立大学法人", vi: "Pháp nhân đại học quốc gia", ne: "राष्ट्रिय विश्वविद्यालय निगम", mn: "Улсын их сургуулийн хуулийн этгээд", uz: "Milliy universitet korporatsiyasi" },
  특별법법인: { en: "Special-act corporation", zh: "特别法法人", vi: "Pháp nhân theo luật đặc biệt", ne: "विशेष ऐन निगम", mn: "Тусгай хуулийн хуулийн этгээд", uz: "Maxsus qonun korporatsiyasi" },
  공립: { en: "Public (local)", zh: "公立", vi: "Công lập", ne: "सार्वजनिक (स्थानीय)", mn: "Орон нутгийн", uz: "Mahalliy davlat" },
  특별법국립: { en: "National (special act)", zh: "特别法国立", vi: "Quốc lập (luật đặc biệt)", ne: "राष्ट्रिय (विशेष ऐन)", mn: "Улсын (тусгай хууль)", uz: "Davlat (maxsus qonun)" },
  기타: { en: "Other", zh: "其他", vi: "Khác", ne: "अन्य", mn: "Бусад", uz: "Boshqa" },
};

// 학제: "전문대학(2년제)"처럼 기본형 + 괄호 구분으로 조합한다.
const SCHOOL_TYPE_BASE: Record<string, Names> = {
  대학교: { en: "University", zh: "大学", vi: "Đại học", ne: "विश्वविद्यालय", mn: "Их сургууль", uz: "Universitet" },
  일반대학원: { en: "Graduate school", zh: "普通研究生院", vi: "Cao học", ne: "स्नातकोत्तर विद्यालय", mn: "Магистрын сургууль", uz: "Magistratura" },
  전문대학원: { en: "Professional graduate school", zh: "专业研究生院", vi: "Cao học chuyên ngành", ne: "व्यावसायिक स्नातकोत्तर विद्यालय", mn: "Мэргэжлийн магистрын сургууль", uz: "Kasbiy magistratura" },
  특수대학원: { en: "Special graduate school", zh: "特殊研究生院", vi: "Cao học đặc biệt", ne: "विशेष स्नातकोत्तर विद्यालय", mn: "Тусгай магистрын сургууль", uz: "Maxsus magistratura" },
  전문대학: { en: "Junior college", zh: "专科大学", vi: "Cao đẳng", ne: "जुनियर कलेज", mn: "Коллеж", uz: "Kollej" },
  방송통신대학: { en: "Open university", zh: "广播通信大学", vi: "Đại học mở", ne: "खुला विश्वविद्यालय", mn: "Нээлттэй их сургууль", uz: "Ochiq universitet" },
  산업대학: { en: "Industrial university", zh: "产业大学", vi: "Đại học công nghiệp", ne: "औद्योगिक विश्वविद्यालय", mn: "Үйлдвэрлэлийн их сургууль", uz: "Sanoat universiteti" },
  사이버대학: { en: "Cyber university", zh: "网络大学", vi: "Đại học trực tuyến", ne: "साइबर विश्वविद्यालय", mn: "Кибер их сургууль", uz: "Kiber universitet" },
  각종대학: { en: "Miscellaneous school", zh: "各类大学", vi: "Trường các loại", ne: "विविध विद्यालय", mn: "Бусад төрлийн сургууль", uz: "Turli oliy maktab" },
  교육대학: { en: "University of education", zh: "教育大学", vi: "Đại học sư phạm", ne: "शिक्षा विश्वविद्यालय", mn: "Багшийн их сургууль", uz: "Pedagogika universiteti" },
  기능대학: { en: "Polytechnic college", zh: "技能大学", vi: "Cao đẳng kỹ thuật", ne: "प्राविधिक कलेज", mn: "Политехник коллеж", uz: "Politexnika kolleji" },
  원격대학: { en: "Distance university", zh: "远程大学", vi: "Đại học từ xa", ne: "दूर शिक्षा विश्वविद्यालय", mn: "Зайн их сургууль", uz: "Masofaviy universitet" },
  전공대학: { en: "Specialized college", zh: "专攻大学", vi: "Trường chuyên ngành", ne: "विशिष्ट कलेज", mn: "Мэргэшсэн коллеж", uz: "Ixtisoslashgan kollej" },
};
const SCHOOL_TYPE_QUALIFIER: Record<string, Names> = {
  "2년제": { en: "2-year", zh: "2年制", vi: "2 năm", ne: "२ वर्षे", mn: "2 жил", uz: "2 yillik" },
  "3년제": { en: "3-year", zh: "3年制", vi: "3 năm", ne: "३ वर्षे", mn: "3 жил", uz: "3 yillik" },
  "4년제": { en: "4-year", zh: "4年制", vi: "4 năm", ne: "४ वर्षे", mn: "4 жил", uz: "4 yillik" },
  대학: { en: "bachelor's", zh: "本科", vi: "đại học", ne: "स्नातक", mn: "бакалавр", uz: "bakalavr" },
  대학과정: { en: "bachelor's", zh: "本科", vi: "đại học", ne: "स्नातक", mn: "бакалавр", uz: "bakalavr" },
  전문: { en: "associate", zh: "专科", vi: "cao đẳng", ne: "एसोसिएट", mn: "коллеж", uz: "kollej" },
  전문대학과정: { en: "associate", zh: "专科", vi: "cao đẳng", ne: "एसोसिएट", mn: "коллеж", uz: "kollej" },
};

const GENDER: Record<string, Names> = {
  남: { en: "Male", zh: "男", vi: "Nam", ne: "पुरुष", mn: "Эрэгтэй", uz: "Erkak" },
  여: { en: "Female", zh: "女", vi: "Nữ", ne: "महिला", mn: "Эмэгтэй", uz: "Ayol" },
};

const pick = (table: Record<string, Names>, value: string, lang: Lang) =>
  lang === "ko" ? value : table[value]?.[lang] ?? table[value.trim()]?.[lang] ?? value;

export const countryName = (v: string, lang: Lang) => pick(COUNTRY, v, lang);
export const statusName = (v: string, lang: Lang) => pick(STATUS, v, lang);
export const programName = (v: string, lang: Lang) => pick(PROGRAM, v, lang);
export const fieldName = (v: string, lang: Lang) => pick(FIELD, v, lang);
export const regionName = (v: string, lang: Lang) => pick(REGION, v, lang);
export const foundingName = (v: string, lang: Lang) => pick(FOUNDING, v, lang);
export const genderName = (v: string, lang: Lang) => pick(GENDER, v, lang);

export function schoolTypeName(v: string, lang: Lang) {
  if (lang === "ko") return v;
  const m = v.match(/^(.+?)\((.+)\)$/);
  const base = SCHOOL_TYPE_BASE[m ? m[1] : v]?.[lang];
  if (!base) return v;
  if (!m) return base;
  const q = SCHOOL_TYPE_QUALIFIER[m[2]]?.[lang];
  return q ? `${base} (${q})` : `${base} (${m[2]})`;
}

/** 대학 이름은 원본 그대로. 미상만 번역한다. */
export const schoolName = (v: string, lang: Lang) => (v === "미상" ? countryName("미상", lang) : v);
