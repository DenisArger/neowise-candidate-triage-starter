import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTriageServer } from "../server.mjs";

let server;
let baseUrl;

before(async () => {
  server = createTriageServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

function post(body, raw = false) {
  return fetch(`${baseUrl}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
  });
}

test("невалидный ввод -> 400 invalid_input", async () => {
  for (const body of [{ text: "" }, { text: "   " }, {}, { text: 42 }, { text: null }]) {
    const res = await post(body);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { status: "invalid_input" });
  }
});

test("битый JSON -> 400 invalid_input", async () => {
  const res = await post("{not json", true);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { status: "invalid_input" });
});

for (const marker of ["[timeout]", "[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
  test(`сбой ${marker} -> manual_review`, async () => {
    const started = Date.now();
    const res = await post({ text: `Заявка ${marker}` });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "manual_review", topic: null, draft: null });
    assert.ok(Date.now() - started < 1000, "ожидание модели должно быть ограничено ~300 мс");
  });
}

test("корректная заявка -> ready", async () => {
  const res = await post({ text: "Когда будет доставка?" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ready");
  assert.equal(body.topic, "delivery");
  assert.equal(typeof body.draft, "string");
  assert.ok(body.draft.trim().length > 0);
});