# K-유학생 데이터랩

법무부 OpenAPI(반기, 2019~) / 교육부·KEDI 엑셀(연도별, 2013~2025) 두 출처를 전환하며 보는
외국인 유학생 체류 현황 대시보드입니다. 화면 상단 토글로 출처를 전환할 수 있습니다.

## 실행

```bash
npm install
npm run dev
npm run build
```

## 데이터 공급 (공공데이터포털 API)

대시보드의 유학생 데이터는 공공데이터포털 `법무부_유학생관리정보 데이터`(data.go.kr id 3069982) API에서
직접 가져온다. `/api/student-data` 라우트가 공공데이터포털 API를 호출해 집계된 JSON을 반환한다.

### 인증키 설정

공공데이터포털 API는 인증키(`KDATA_API_KEY`)가 필요하다.

- **로컬 개발:** `.env.example`을 `.env`로 복사해 `KDATA_API_KEY=<인증키>` 입력
- **Vercel 배포:** 대시보드(vercel.com) → 프로젝트 → Settings → Environment Variables에
  `KDATA_API_KEY` 추가

인증키는 공개 저장소에 커밋하지 말 것.

### 로컬 데이터 동기화 (선택)

공공데이터포털 원본을 `public/student-data.json`으로 로컬 저장하려면:

```bash
cp .env.example .env
# .env에 KDATA_API_KEY=<인증키> 입력 후:
npm run sync:data
```

- 스크립트: `scripts/sync-student-data.mjs`
- 검증 문서: `docs/data-verification.md`

시계열 차트(`public/trend-data.json`)는 `npm run sync:trend`로 별도 생성한다. `npm run dev`
(vinext)는 이 동기화를 자동으로 실행하지 않으므로, 로컬에서 시계열 차트를 보려면 최초 1회
`npm run sync:trend`를 직접 실행해야 한다. Vercel 배포(`npm run vercel-build`)에서는 자동 실행된다.

## 데이터 공급 (교육부·KEDI 고등교육기관 외국인 유학생 현황)

`data/moe/*.xlsx` (2013~2025년, 한국교육개발원 발간 자료)를 빌드 시 파싱해
`public/moe-yearly.json`(연도별 집계, 즉시 로드)과 `public/moe-cross-{year}.json`(학교×국가
교차표, 연도 선택 시 지연 로딩)을 생성한다. 법무부 API와 달리 **인증키가 필요 없다** — 저장소에
커밋된 로컬 엑셀만 읽으므로 오프라인에서도 재현 가능하다.

```bash
npm run sync:moe
```

- 스크립트: `scripts/sync-moe-data.mjs` (xlsx 파싱: `scripts/lib/xlsx-reader.mjs`,
  `scripts/lib/moe-headers.mjs`)
- 골든 값 검증 테스트: `tests/moe-parse.test.mjs`
- `npm run dev`(vinext)도 이 동기화를 자동 실행하지 않으므로, 로컬에서 교육부 데이터 화면을
  보려면 최초 1회 `npm run sync:moe`를 직접 실행해야 한다. Vercel 배포에서는 자동 실행된다.

## 구성

- `app/`: 대시보드 화면(`components/MojBody.tsx` 법무부, `components/MoeBody.tsx` 교육부)과 공용 헬퍼(`lib/`)
- `worker/`: Cloudflare Worker 진입점
- `scripts/`: 데이터 동기화 등 유틸리티
- `data/moe/`: 교육부·KEDI 원본 엑셀(공개 서빙되지 않음, 빌드 시에만 읽음)
- `.openai/hosting.json`: Sites 프로젝트 설정
- `public/student-data.json`, `public/trend-data.json`, `public/moe-*.json`: 원본 데이터는 공개 저장소에서 제외

데이터 출처:
- [공공데이터포털 법무부_유학생관리정보 데이터](https://www.data.go.kr/data/3069982/fileData.do)
- 교육부·한국교육개발원(KEDI) 고등교육기관 외국인 유학생 현황 (연도별 발간 자료)