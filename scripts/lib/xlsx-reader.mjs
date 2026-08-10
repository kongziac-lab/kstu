#!/usr/bin/env node
/**
 * 최소 xlsx(zip) 리더 — 외부 의존성 없이 node:zlib만 사용한다.
 *
 * xlsx는 ZIP 컨테이너에 담긴 평문 XML(OOXML SpreadsheetML)이다. 이 모듈은
 * 그 최소 부분집합만 지원한다:
 *   - ZIP 중앙 디렉터리 파싱 (compression method 0=저장 / 8=deflate)
 *   - workbook.xml → workbook.xml.rels 를 통해 "시트 표시 순서"대로 시트를 해석
 *   - sharedStrings.xml 의 <si> 항목을 평문 문자열 배열로 해석 (서식 런 병합)
 *   - 시트 XML의 <row>/<c>/<v> 를 스트리밍 정규식으로 파싱해 문자열 2차원 배열로 반환
 *
 * 빌드 시점에 신뢰된 로컬 파일(data/moe/*.xlsx)만 읽는 용도로 설계했다.
 * 임의의 사용자 업로드 xlsx를 다루려면 exceljs 등 검증된 라이브러리로 교체할 것.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function findEOCD(buf) {
  // EOCD는 최소 22바이트, 파일 끝단(코멘트 포함 최대 64KB)에서 뒤로 탐색한다.
  const minOffset = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("EOCD를 찾을 수 없습니다 — 올바른 zip/xlsx 파일이 아닙니다.");
}

function readCentralDirectory(buf) {
  const eocdOffset = findEOCD(buf);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdCount = buf.readUInt16LE(eocdOffset + 10);
  const entries = new Map();
  let offset = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== CENTRAL_SIG) {
      throw new Error(`중앙 디렉터리 시그니처 오류 (offset ${offset})`);
    }
    const compMethod = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    entries.set(name, { compMethod, compSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf, entry) {
  const lh = entry.localHeaderOffset;
  const sig = buf.readUInt32LE(lh);
  if (sig !== LOCAL_SIG) {
    throw new Error(`로컬 헤더 시그니처 오류 (offset ${lh})`);
  }
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + entry.compSize);
  if (entry.compMethod === 0) return Buffer.from(data);
  if (entry.compMethod === 8) return inflateRawSync(data);
  throw new Error(`지원하지 않는 압축 방식입니다: ${entry.compMethod}`);
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml))) {
    const body = m[1];
    const parts = [];
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tRegex.exec(body))) parts.push(decodeXmlEntities(tm[1]));
    strings.push(parts.join(""));
  }
  return strings;
}

/** "A1" -> 0, "B1" -> 1, "AA1" -> 26, ... (0-based 열 인덱스) */
function colRefToIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

/** 시트 XML을 1-based 행 번호 -> 셀 값 배열(sparse, 0-based 열) Map으로 파싱한다. */
function parseSheetRows(xml, sharedStrings) {
  const rows = new Map();
  const rowRegex = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(xml))) {
    const rowNum = Number(rm[1]);
    const rowBody = rm[2];
    const cellRegex = /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    const cells = [];
    let cm;
    while ((cm = cellRegex.exec(rowBody))) {
      const attrs = cm[1] ?? cm[2] ?? "";
      const inner = cm[3] ?? "";
      const refMatch = attrs.match(/\br="([A-Z]+\d+)"/);
      if (!refMatch) continue;
      const colIndex = colRefToIndex(refMatch[1]);
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : null;
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      let value = vMatch ? vMatch[1] : "";
      if (type === "s") {
        value = value === "" ? "" : sharedStrings[Number(value)] ?? "";
      } else if (type === "inlineStr") {
        const isMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        value = isMatch ? decodeXmlEntities(isMatch[1]) : "";
      } else if (value) {
        value = decodeXmlEntities(value);
      }
      cells[colIndex] = value;
    }
    rows.set(rowNum, cells);
  }
  return rows;
}

/**
 * xlsx 파일을 열어 표시 순서(workbook.xml <sheets> 순서)대로 접근 가능한
 * 리더를 반환한다.
 */
export function openXlsx(filePath) {
  const buf = readFileSync(filePath);
  const central = readCentralDirectory(buf);

  function readText(name) {
    const entry = central.get(name);
    if (!entry) return null;
    return readEntry(buf, entry).toString("utf8");
  }

  const workbookXml = readText("xl/workbook.xml");
  if (!workbookXml) throw new Error(`xl/workbook.xml 을 찾을 수 없습니다: ${filePath}`);

  const relsXml = readText("xl/_rels/workbook.xml.rels") ?? "";
  const relTargets = new Map();
  const relRegex = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g;
  let relm;
  while ((relm = relRegex.exec(relsXml))) relTargets.set(relm[1], relm[2]);

  const sheetMetaRegex = /<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"[^>]*\/>/g;
  const sheets = [];
  let sm;
  while ((sm = sheetMetaRegex.exec(workbookXml))) {
    const [, name, rId] = sm;
    const target = relTargets.get(rId);
    if (!target) continue;
    sheets.push({ name, path: `xl/${target}` });
  }

  const sharedStrings = parseSharedStrings(readText("xl/sharedStrings.xml"));

  return {
    /** 표시 순서(0-based)의 시트 이름 목록 */
    sheetNames: sheets.map((s) => s.name),
    /**
     * 0-based 표시 순서 인덱스로 시트를 읽어 { rows: string[][] } 로 반환한다.
     * 결측 셀은 빈 문자열("")로 채운다. minRow 이전 행은 건너뛴다(기본 1).
     */
    readSheet(sheetIndex, { minRow = 1 } = {}) {
      const sheet = sheets[sheetIndex];
      if (!sheet) throw new Error(`시트 인덱스가 범위를 벗어났습니다: ${sheetIndex} (총 ${sheets.length}개)`);
      const xml = readText(sheet.path);
      if (xml == null) throw new Error(`시트 파일을 찾을 수 없습니다: ${sheet.path}`);
      const rowMap = parseSheetRows(xml, sharedStrings);
      const maxRow = Math.max(0, ...rowMap.keys());
      const result = [];
      for (let r = minRow; r <= maxRow; r++) {
        const cells = rowMap.get(r);
        result.push(cells ? Array.from(cells, (v) => v ?? "") : []);
      }
      return { rows: result, sheetName: sheet.name };
    },
  };
}
