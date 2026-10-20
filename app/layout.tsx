import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL } from "./lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "K-유학생 데이터랩 | 외국인 유학생 체류 현황",
  description: "법무부·교육부 공공데이터로 보는 대한민국 외국인 유학생 현황",
  // 검색엔진 소유 확인(지우면 인증이 풀린다). Google은 DNS TXT로 인증했다.
  verification: {
    other: {
      "naver-site-verification": "c371a1ad7e27a31f285f4467e4f0cf910ec1b6eb",
      "msvalidate.01": "47A6BB3979BD8DB79C5A85C378A717C7",
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
