// test/summarizer-enforcement.test.js — end-to-end enforcement of the
// steering rules through summarizeItem() (Phase 2, task 22), against a
// local stub model server instead of the real provider. Proves the
// validate -> one named retry -> refuse-to-store path with real HTTP
// calls and the real call counter. Run with `npm test` (node --test).
//
// NOTE: the summarizer reads SUMMARIZER_BASE_URL at import time, so the
// env vars must be set BEFORE the dynamic import below.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const SRC = {
  title: "City council approves transit plan",
  content:
    "The city council approved a new transit plan on Tuesday, adding 12 bus routes across the metro area. The plan takes effect next year.",
};

const GOOD_RESPONSE =
  "The city council approved the new transit plan on Tuesday. The plan adds 12 bus routes across the metro area.\n" +
  "WHY IT MATTERS: Commuters will see shorter waits starting next year.";

const BAD_RESPONSE =
  "This shocking plan changes everything.\n" +
  "WHY IT MATTERS: You won't believe what happens next.";

let summarizer;

// One stub server per test file run; each test queues its own responses.
const queue = [];
const requests = [];
let server;
let port;

test.before(async () => {
  server = http.createServer((req, res) => {
    requests.push(decodeURIComponent(req.url || ""));
    const next = queue.shift();
    if (next === null || next === undefined) {
      res.writeHead(500);
      res.end("stub: no response queued");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(next);
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      resolve();
    });
  });
  process.env.SUMMARIZER_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUMMARIZER_TIMEOUT_MS = "5000";
  summarizer = await import("../src/lib/summarizer.js");
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function calls() {
  return summarizer.getSummarizerStats().calls;
}

test("a good first result costs exactly 1 call", async () => {
  queue.push(GOOD_RESPONSE);
  const before = calls();
  const r = await summarizer.summarizeItem(SRC);
  assert.equal(calls() - before, 1);
  assert.match(r.summary, /12 bus routes/);
  assert.match(r.whyItMatters, /shorter waits/);
});

test("a rule-breaking first result is retried with the violations named, and the good retry is stored", async () => {
  queue.push(BAD_RESPONSE, GOOD_RESPONSE);
  const before = calls();
  const reqBefore = requests.length;
  const r = await summarizer.summarizeItem(SRC);
  assert.equal(calls() - before, 2);
  assert.match(r.summary, /12 bus routes/);
  const retryPrompt = requests[reqBefore + 1];
  assert.match(retryPrompt, /broke these steering rules/);
  assert.match(retryPrompt, /shocking/);
});

test("a retry that still breaks the rules is refused, never stored", async () => {
  queue.push(BAD_RESPONSE, BAD_RESPONSE);
  const before = calls();
  await assert.rejects(() => summarizer.summarizeItem(SRC), /steering rules/);
  assert.equal(calls() - before, 2);
});

test("a rule-breaking first result plus a failed retry throws (no violating summary kept)", async () => {
  queue.push(BAD_RESPONSE, null);
  const before = calls();
  await assert.rejects(() => summarizer.summarizeItem(SRC));
  assert.equal(calls() - before, 2);
});
