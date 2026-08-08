# K-유학생 데이터랩

법무부 OpenAPI 기반 외국인 유학생 체류 현황 대시보드입니다.

## 실행

```bash
npm install
npm run dev
npm run build
```

## 데이터 동기화 (법무부 계산)

대시보드의 유학생 데이터는 공공데이터포털 `법무부_유학생관리정보 데이터`(data.go.kr id 3069982) API에서
가져온다. API가 업데이트되면(새 기준일 데이터 배포) 아래 명령으로 최신 데이터를 동기화한다.

```bash
# 인증키 설정
cp .env.example .env
# .env에 KDATA_API_KEY=<인증키> 입력 후:

npm run sync:data
```

- 스크립트: `scripts/sync-student-data.mjs`
- 출력: `public/student-data.json` (대시보드가 사용; 원본 데이터는 저장소에서 제외됨)
- 검증 문서: `docs/data-verification.md`

**주의:** 인증키(`KDATA_API_KEY`)는 공개 저장소에 커밋하지 말고 `.env`로 관리한다.
`public/student-data.json`는 원본 데이터라 기본적으로 커밋에서 제외된다.

## 구성

- `app/`: 대시보드 화면과 인증 헬퍼
- `worker/`: Cloudflare Worker 진입점
- `scripts/`: 데이터 동기화 등 유틸리티
- `.openai/hosting.json`: Sites 프로젝트 설정
- `public/student-data.json`: 원본 데이터는 공개 저장소에서 제외

이 저장소는 [K-유학생 데이터랩](https://k-student-datalab.halan80228.chatgpt.site/)의 프로그램 소스입니다.

데이터 출처: [공공데이터포털 법무부_유학생관리정보 데이터](https://www.data.go.kr/data/3069982/fileData.do)
