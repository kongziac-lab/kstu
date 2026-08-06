�r�^�f��ئ{}ly�'vî���import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K-유학생 데이터랩 | 외국인 유학생 체류 현황",
  description: "법무부 OpenAPI 기반 학교·국가·체류자격·성별 외국인 유학생 현황 대시보드",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
