// test/dedupe.test.js — link normalization + canonical-URL dedupe
// (Phase 2, task 23, Req 4). Run with `npm test` (node --test).
//
// The store tests use a throwaway SQLite file: REVENANT_DB_PATH is set
// BEFORE the store module is dynamically imported, so getDb() picks up
// the temp path. Each test file runs in its own process, so the env
// assignment cannot leak into the other suites.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { normalizeLink } from "../src/lib/feed.js";

process.env.REVENANT_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), "rr-dedupe-")),
  "test.db",
);
const store = await import("../src/lib/feeds-store.js");
const { getDb } = await import("../src/lib/db.js");

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

function item(guid, link, title = "Story") {
  return {
    guid,
    link,
    title,
    publishedAt: "2026-11-11T06:00:00.000Z",
    contentSnippet: "Excerpt.",
  };
}

// --- normalizeLink -------------------------------------------------------

test("normalizeLink strips BBC at_* params (task 17 gap)", () => {
  assert.equal(
    normalizeLink(
      "https://www.bbc.com/news/articles/c123?at_medium=RSS&at_campaign=8008&at_custom1=x",
    ),
    "https://www.bbc.com/news/articles/c123",
  );
});

test("normalizeLink strips utm_*, fbclid, gclid, mc_*, igshid, _ga, si", () => {
  assert.equal(
    normalizeLink(
      "https://example.com/post?utm_source=rss&utm_medium=x&fbclid=AAA&gclid=BBB&mc_cid=1&mc_eid=2&igshid=abc&_ga=1.2.3",
    ),
    "https://example.com/post",
  );
  assert.equal(
    normalizeLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abcdef"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
});

test("normalizeLink strips tracking params case-insensitively", () => {
  assert.equal(
    normalizeLink("https://example.com/post?UTM_SOURCE=rss&At_Medium=RSS"),
    "https://example.com/post",
  );
});

test("normalizeLink keeps article-identity params (Req 4 AC3)", () => {
  assert.equal(
    normalizeLink("https://example.com/list?page=2&id=7&q=hello"),
    "https://example.com/list?page=2&id=7&q=hello",
  );
  assert.notEqual(
    normalizeLink("https://example.com/a?v=1"),
    normalizeLink("https://example.com/a?v=2"),
  );
  assert.notEqual(
    normalizeLink("https://example.com/post-one"),
    normalizeLink("https://example.com/post-two"),
  );
});

test("normalizeLink strips fragments and trailing slashes", () => {
  assert.equal(
    normalizeLink("https://example.com/post/#section"),
    "https://example.com/post",
  );
  assert.equal(normalizeLink("https://example.com/post/"), "https://example.com/post");
  assert.equal(normalizeLink("https://example.com/"), "https://example.com/");
  assert.equal(normalizeLink("ftp://example.com/x"), "");
  assert.equal(normalizeLink("not a url"), "");
});

// --- storeItems dedupe ---------------------------------------------------

test("same story from a second feed collapses to one card", () => {
  const feedA = makeFeed("Feed A");
  const feedB = makeFeed("Feed B");
  store.addFeed(feedA, []);
  const rA = store.storeItems(feedA.id, [
    item("a-1", "https://example.com/story-one", "Story One"),
  ]);
  assert.equal(rA.inserted, 1);
  assert.equal(store.countItems(), 1);

  // Feed B carries the SAME story: tracking params on the link, a
  // different guid — only the canonical URL can collapse these.
  const addedB = store.addFeed(feedB, [
    item(
      "b-1",
      "https://example.com/story-one?at_medium=RSS&at_campaign=8008&utm_source=rss",
      "Story One",
    ),
  ]);
  assert.ok(addedB);
  assert.equal(store.countItems(), 1, "no second row for the duplicate");

  const listed = store.listItemsWithSource();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].url, "https://example.com/story-one");
  assert.equal(listed[0].source, "Feed A");
  assert.deepEqual(
    listed[0].sources.map((s) => s.title).sort(),
    ["Feed A", "Feed B"],
    "both feeds recorded as sources",
  );
  // The story is findable under the second feed's filter too, once.
  const underB = store.listItemsWithSource(feedB.id);
  assert.equal(underB.length, 1);
  assert.equal(underB[0].id, listed[0].id);
});

test("same feed, same URL, different guid collapses (re-issued item)", () => {
  const feed = makeFeed("Feed C");
  store.addFeed(feed, [item("c-1", "https://example.com/story-two", "Story Two")]);
  const r = store.storeItems(feed.id, [
    item("c-2", "https://example.com/story-two", "Story Two"),
  ]);
  assert.equal(r.duplicates, 1);
  assert.equal(r.inserted, 0);
  assert.equal(store.countItems(feed.id), 1);
});

test("same-feed re-fetch refreshes content without resetting state", () => {
  const feed = makeFeed("Feed D");
  store.addFeed(feed, [item("d-1", "https://example.com/story-three", "Old title")]);
  const before = store.listItems(feed.id)[0];
  store.updateItem(before.id, { read: true, starred: true });
  const r = store.storeItems(feed.id, [
    item("d-1", "https://example.com/story-three", "New title"),
  ]);
  assert.equal(r.inserted, 1, "re-fetch goes through the upsert");
  const after = store.listItems(feed.id)[0];
  assert.equal(after.id, before.id);
  assert.equal(after.title, "New title");
  assert.equal(after.read, true);
  assert.equal(after.starred, true);
});

test("same title, different URL stays two cards (Req 4 AC3)", () => {
  const feed = makeFeed("Feed E");
  store.addFeed(feed, [
    item("e-1", "https://example.com/story-a", "Same Title"),
    item("e-2", "https://example.com/story-b", "Same Title"),
  ]);
  assert.equal(store.countItems(feed.id), 2);
});

test("duplicate never generates a second summary (Req 4 AC4)", () => {
  const feedA = makeFeed("Feed F");
  const feedB = makeFeed("Feed G");
  store.addFeed(feedA, [item("f-1", "https://example.com/story-four", "Story Four")]);
  const survivor = store.listItems(feedA.id)[0];
  store.setItemSummary(survivor.id, {
    summary: "Kept summary. It stays put.",
    whyItMatters: "Because it matters.",
  });
  store.addFeed(feedB, [
    item("g-1", "https://example.com/story-four?utm_source=rss", "Story Four"),
  ]);
  const after = store.getItemWithSource(survivor.id);
  assert.equal(after.summary, "Kept summary. It stays put.");
  assert.equal(after.whyItMatters, "Because it matters.");
  assert.equal(store.listUnsummaryizedItems(feedB.id).length, 0);
});

// --- collapseDuplicateItems (pre-task-23 rows) ---------------------------

test("collapseDuplicateItems merges legacy duplicate rows", () => {
  const db = getDb();
  const feedH = makeFeed("Feed H");
  const feedI = makeFeed("Feed I");
  store.addFeed(feedH, []);
  store.addFeed(feedI, []);
  const insert = db.prepare(
    `INSERT INTO items (id, feedId, guid, canonicalUrl, title, content, publishedAt, read, starred, summary, whyItMatters)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const survivorId = randomUUID();
  insert.run(
    survivorId, feedH.id, "h-1", "https://example.com/legacy", "Legacy",
    "", "2026-11-11T05:00:00.000Z", 0, 0, null, null,
  );
  const dupId = randomUUID();
  insert.run(
    dupId, feedI.id, "i-1", "https://example.com/legacy", "Legacy",
    "", "2026-11-11T05:00:00.000Z", 0, 1, "Dup summary. Second sentence.",
    "Dup why.",
  );
  const countLegacy = () =>
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM items WHERE canonicalUrl = ?")
      .get("https://example.com/legacy").n;
  assert.equal(countLegacy(), 2);
  const result = store.collapseDuplicateItems();
  assert.equal(result.groups, 1);
  assert.equal(result.removed, 1);
  assert.equal(countLegacy(), 1);
  const survivor = store.getItemWithSource(survivorId);
  assert.equal(survivor.summary, "Dup summary. Second sentence.");
  assert.equal(survivor.starred, true, "starred merged from the duplicate");
  assert.deepEqual(
    survivor.sources.map((s) => s.title).sort(),
    ["Feed H", "Feed I"],
  );
});
