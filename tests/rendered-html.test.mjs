import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  // 한국어 문서
  assert.match(html, /<html[^>]*lang="ko"/i);
});

test("includes dashboard metadata", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /K-유학생 데이터랩/);
  assert.match(html, /외국인 유학생 체류 현황/);
  assert.match(html, /법무부/);
});

test("shows the loading state before data arrives", async () => {
  const response = await render();
  const html = await response.text();

  // 데이터가 아직 로드되기 전에는 로딩 화면을 서버에서 렌더링한다.
  assert.match(html, /유학생 현황을 불러오는 중입니다/);
  assert.match(html, /loader/);
});