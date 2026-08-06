# K-유학생 데이터랩

법무부 OpenAPI 기반 외국인 유학생 체류 현황 대시보드입니다.

## 실행

```bash
npm install
npm run dev
npm run build
```

## 구성

- `app/`: 대시보드 화면과 인증 헬퍼
- `worker/`: Cloudflare Worker 진입점
- `.openai/hosting.json`: Sites 프로젝트 설정
- `public/student-data.json`: 원본 데이터는 공개 저장소에서 제외

이 저장소는 [K-유학생 데이터랩](https://k-student-datalab.halan80228.chatgpt.site/)의 프로그램 소스입니다.

데이터 출처: [공공데이터포털 법무부_유학생관리정보 데이터](https://www.data.go.kr/data/3069982/fileData.do)
