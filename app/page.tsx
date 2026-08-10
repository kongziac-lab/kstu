"use client";

import { useState } from "react";
import MojBody from "./components/MojBody";
import MoeBody from "./components/MoeBody";
import type { DataSource } from "./lib/types";

const SOURCES: { id: DataSource; label: string; hint: string }[] = [
  { id: "moj", label: "법무부", hint: "반기 · 2019~" },
  { id: "moe", label: "교육부", hint: "연도별 · 2013~2025" },
];

export default function Home() {
  const [source, setSource] = useState<DataSource>("moj");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">K</div>
        <div className="brand"><strong>K-유학생 데이터랩</strong><span>{source === "moj" ? "법무부 외국인 유학생 체류 현황" : "교육부 고등교육기관 외국인 유학생 현황"}</span></div>
        <div className="source-toggle" role="tablist" aria-label="데이터 출처 선택">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={source === s.id}
              className={source === s.id ? "active" : ""}
              onClick={() => setSource(s.id)}
            >
              <strong>{s.label}</strong>
              <small>{s.hint}</small>
            </button>
          ))}
        </div>
      </header>

      {source === "moj" ? <MojBody /> : <MoeBody />}
    </div>
  );
}
