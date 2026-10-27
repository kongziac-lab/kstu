import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: process.env.VERCEL ? "tsconfig.vercel.json" : "tsconfig.json",
  },
  // MCP 서버(app/api/mcp)와 출처 페이지(sources)가 fs로 읽는 교육부 집계 JSON을 함수 번들에 포함한다.
  outputFileTracingIncludes: {
    "/api/mcp": ["./public/moe-yearly.json", "./public/moe-school-trend.json"],
    "/sources": ["./public/moe-yearly.json"],
    "/[lang]/sources": ["./public/moe-yearly.json"],
  },
};

export default nextConfig;
