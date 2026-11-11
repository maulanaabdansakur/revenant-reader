// test/digest.test.js — GET /api/digest (Phase 3, task 26, Req 5).
// Run with `npm test` (node --test).
//
// The route test uses a throwaway SQLite file: REVENANT_DB_PATH is set
// BEFORE the store/route modules are dynamically imported, so getDb()
// picks up the temp path. Each test file runs in its own process, so the
// env assignment cannot leak into the other suites.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.REVENANT_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), "rr-digest-")),
  "test.db",
);
const store = await import("../src/lib/feeds-store.js");
const { rankDigest } = await import("../src/lib/ranking.js");
const { getDigest } = await import("../src/lib/digest.js");

function makeFeed(title) {
  return {
    id: randomUUID(),
    url: `https://example.com/${title.toLowerCase().replace(/\s+/g, "-")}.xml`,
    title,
    siteUrl: "https://example.com",
    addedAt: new Date().toISOString(),
    lastFetchedAt: new Date().toISOString(),
    lastError: null,
  };
}

// Parsed-feed item shape (what fetchFeed returns): guid, link, title,
// contentSnippet, publishedAt.
function item(guid, hoursAgo, title = "Story") {
  return {
    guid,
    link: `https://example.com/articles/${guid}`,
    title,
    contentSnippet: "Excerpt.",
    publishedAt:
      hoursAgo === null
        ? null
        : new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
  };
}

function getDigestResponse() {
  return getDigest();
}

test("digest ranks the last-24h stories in rankDigest order, capped at 3 per feed", async () => {
  const loud = makeFeed("Loud Feed");
  const quiet = makeFeed("Quiet Feed");
  // Loud feed: 5 stories, all within the window — only 3 may rank.
  store.addFeed(loud, [
    item("loud-1", 1, "Loud one"),
    item("loud-2", 2, "Loud two"),
    item("loud-3", 3, "Loud three"),
    item("loud-4", 4, "Loud four"),
    item("loud-5", 5, "Loud five"),
  ]);
  // Quiet feed: 2 stories, one older than the window (excluded).
  store.addFeed(quiet, [
    item("quiet-1", 0.5, "Quiet one"),
    item("quiet-2", 30, "Quiet old"),
  ]);

  const data = getDigestResponse();
  assert.equal(data.limit, 10);
  assert.equal(data.windowHours, 24);
  // 5 loud + 1 quiet in window = 6 candidates; cap 3 loud → 4 ranked.
  assert.equal(data.count, 4);
  assert.equal(data.stories.length, 4);

  // Order, ranks, and scores match rankDigest exactly.
  const expected = rankDigest(store.listItemsWithSource());
  assert.deepEqual(
    data.stories.map((s) => s.id),
    expected.map((s) => s.id),
  );
  assert.deepEqual(
    data.stories.map((s) => s.rank),
    [1, 2, 3, 4],
  );
  const scores = data.stories.map((s) => s.rankScore);
  for (let i = 1; i < scores.length; i += 1) {
    assert.ok(scores[i] <= scores[i - 1], "scores non-increasing");
  }
  // Cap: at most 3 from the loud feed.
  const loudCount = data.stories.filter((s) => s.feedId === loud.id).length;
  assert.equal(loudCount, 3);
  // The >24h story never appears.
  assert.ok(!data.stories.some((s) => s.title === "Quiet old"));
  // Cards carry the same list shape (url/source) as /api/items.
  for (const s of data.stories) {
    assert.ok(s.url.startsWith("https://example.com/articles/"));
    assert.ok(typeof s.source === "string" && s.source.length > 0);
  }
});

test("digest with fewer than 10 stories reports the smaller count", async () => {
  // The previous test left 4 ranked stories in the shared temp DB; the
  // count below must equal the live ranked set, not a fixed number.
  const data = getDigestResponse();
  assert.ok(data.count < data.limit);
  assert.equal(data.stories.length, data.count);
});

test("undated and >24h items never enter the digest", async () => {
  const stale = makeFeed("Stale Feed");
  store.addFeed(stale, [
    item("stale-undated", null, "No date at all"),
    item("stale-old", 48, "Two days old"),
  ]);
  const data = getDigestResponse();
  assert.ok(!data.stories.some((s) => s.title === "No date at all"));
  assert.ok(!data.stories.some((s) => s.title === "Two days old"));
});
