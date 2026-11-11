// test/refresh.test.js — POST /api/refresh logic (Phase 3, task 27,
// Req 3, 4, 5). Run with `npm test` (node --test).
//
// Tests the logic module src/lib/refresh.js directly (the route is a
// thin wrapper around it — same pattern as test/digest.test.js). A
// throwaway SQLite file: REVENANT_DB_PATH is set BEFORE the store/
// refresh modules are dynamically imported. Each test file runs in its
// own process, so the env assignment cannot leak into other suites.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.REVENANT_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), "rr-refresh-")),
  "test.db",
);
const store = await import("../src/lib/feeds-store.js");
const refresh = await import("../src/lib/refresh.js");

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

test("refresh stores new items from all feeds and reports per-feed counts", async () => {
  const feedA = makeFeed("Feed A");
  const feedB = makeFeed("Feed B");
  store.addFeed(feedA, [item("a-1", 1, "A one")]);
  store.addFeed(feedB, [item("b-1", 2, "B one")]);

  // The stub fetch returns one brand-new item per feed plus the one
  // already stored (a re-fetch upsert — not a new row).
  const stubFetch = async (url) => {
    if (url.includes("feed-a")) {
      return { title: "Feed A", siteUrl: "https://example.com", items: [item("a-1", 1, "A one"), item("a-2", 0.5, "A two")] };
    }
    return { title: "Feed B", siteUrl: "https://example.com", items: [item("b-1", 2, "B one"), item("b-2", 0.25, "B two")] };
  };

  const result = await refresh.refreshAllFeeds({ fetchFeedFn: stubFetch });
  assert.equal(result.alreadyRunning, undefined);
  assert.equal(result.feeds.length, 2);
  assert.equal(result.totalInserted, 2);
  assert.equal(result.totalDuplicates, 0);
  assert.equal(result.errors, 0);
  for (const r of result.feeds) {
    assert.equal(r.inserted, 1);
    assert.equal(r.fetched, 2);
    assert.equal(r.error, null);
    // lastFetchedAt recorded, lastError cleared.
    const feed = store.findFeedById(r.feedId);
    assert.equal(feed.lastFetchedAt, result.refreshedAt);
    assert.equal(feed.lastError, null);
  }
  assert.equal(store.countItems(), 4);
});

test("a second refresh of unchanged feeds inserts nothing and counts duplicates", async () => {
  const stubFetch = async (url) => {
    if (url.includes("feed-a")) {
      return { title: "Feed A", siteUrl: "https://example.com", items: [item("a-1", 1, "A one"), item("a-2", 0.5, "A two")] };
    }
    return { title: "Feed B", siteUrl: "https://example.com", items: [item("b-1", 2, "B one"), item("b-2", 0.25, "B two")] };
  };
  const result = await refresh.refreshAllFeeds({ fetchFeedFn: stubFetch });
  assert.equal(result.totalInserted, 0);
  assert.equal(store.countItems(), 4);
});

test("a failing feed is recorded with its error and never stops the others", async () => {
  const feedC = makeFeed("Feed C");
  store.addFeed(feedC, []);
  const stubFetch = async (url) => {
    if (url.includes("feed-c")) throw new Error("Feed server returned HTTP 500.");
    return { title: "Feed", siteUrl: "https://example.com", items: [] };
  };
  const result = await refresh.refreshAllFeeds({ fetchFeedFn: stubFetch });
  assert.equal(result.errors, 1);
  const failed = result.feeds.find((r) => r.feedId === feedC.id);
  assert.equal(failed.error, "Feed server returned HTTP 500.");
  assert.equal(failed.inserted, 0);
  assert.equal(failed.fetched, 0);
  const feed = store.findFeedById(feedC.id);
  assert.equal(feed.lastError, "Feed server returned HTTP 500.");
  assert.equal(feed.lastFetchedAt, result.refreshedAt);
  // The other feeds still refreshed fine (no error).
  assert.ok(result.feeds.filter((r) => r.feedId !== feedC.id).every((r) => r.error === null));
});

test("refreshAndSummarize runs the summarize batch for feeds with pending items", async () => {
  const summarized = [];
  const stubSummarize = async (feedId) => {
    summarized.push(feedId);
    return { attempted: 0, succeeded: 0, failed: 0 };
  };
  const stubFetch = async () => ({ title: "Feed", siteUrl: "https://example.com", items: [] });
  const result = await refresh.refreshAndSummarize({
    fetchFeedFn: stubFetch,
    summarizeFeedFn: stubSummarize,
  });
  assert.equal(result.summaries.alreadyRunning, undefined);
  // One summarize call per subscribed feed (3 by now: A, B, C).
  assert.equal(result.summaries.feeds.length, 3);
  assert.deepEqual(summarized.sort(), result.summaries.feeds.map((f) => f.feedId).sort());
  assert.equal(result.summaries.totalAttempted, 0);
});

test("overlapping refreshes: the second caller gets alreadyRunning", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slowFetch = async () => {
    await gate;
    return { title: "Feed", siteUrl: "https://example.com", items: [] };
  };
  const first = refresh.refreshAllFeeds({ fetchFeedFn: slowFetch });
  const second = await refresh.refreshAllFeeds({ fetchFeedFn: slowFetch });
  assert.equal(second.alreadyRunning, true);
  release();
  const firstResult = await first;
  assert.equal(firstResult.alreadyRunning, undefined);
  assert.equal(firstResult.errors, 0);
});
