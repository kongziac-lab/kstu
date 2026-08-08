# K-유학생 데이터랩

법무부 OpenAPI 기반 외국인 유학생 체류 현황 대시보드입니다.

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

## 구성

- `app/`: 대시보드 화면과 인증 헬퍼
- `worker/`: Cloudflare Worker 진입점
- `scripts/`: 데이터 동기화 등 유틸리티
- `.openai/hosting.json`: Sites 프로젝트 설정
- `public/student-data.json`: 원본 데이터는 공개 저장소에서 제외

데이터 출처: [공공데이터포털 법무부_유학생관리정보 데이터](https://www.data.go.kr/data/3069982/fileData.do)