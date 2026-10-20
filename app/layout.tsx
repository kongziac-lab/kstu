import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL } from "./lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "K-유학생 데이터랩 | 외국인 유학생 체류 현황",
  description: "법무부·교육부 공공데이터로 보는 대한민국 외국인 유학생 현황",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
