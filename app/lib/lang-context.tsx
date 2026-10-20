"use client";
// 화면 언어를 컴포넌트 트리에 내려준다. 언어는 URL(/, /en, /zh ...)로 정해지고
// 페이지마다 고정이라, 언어를 바꾸면 해당 URL로 이동한다.
import { createContext, useContext } from "react";
import { DICTS, type Lang } from "./i18n";

const LangContext = createContext<Lang>("ko");

export const LangProvider = LangContext.Provider;

export function useLang() {
  const lang = useContext(LangContext);
  return { lang, t: DICTS[lang] };
}
