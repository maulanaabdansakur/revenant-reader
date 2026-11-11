// test/title-dedupe.test.js — normalized-title dedupe across feeds
// (Phase 2, task 24, Req 4 + design doc, Dedupe algorithm step 3).
// Run with `npm test` (node --test).
//
// Same pattern as test/dedupe.test.js: a throwaway SQLite file, with
// REVENANT_DB_PATH set BEFORE the store module is dynamically imported.
// Tests share one DB file, so every test uses distinct titles/links.

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { normalizeTitle } from "../src/lib/feed.js";

process.env.REVENANT_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), "rr-title-dedupe-")),
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

function item(guid, link, title, publishedAt = "2026-11-11T06:00:00.000Z") {
  return { guid, link, title, publishedAt, contentSnippet: "Excerpt." };
}

// --- normalizeTitle ------------------------------------------------------

test("normalizeTitle strips punctuation, case and extra whitespace", () => {
  assert.equal(normalizeTitle("City Unveils New Park!"), "city unveils new park");
  assert.equal(normalizeTitle("  City   unveils   new  park "), "city unveils new park");
  assert.equal(normalizeTitle("Don't stop: the mayor's plan?"), "dont stop the mayors plan");
  assert.equal(normalizeTitle(""), "");
  assert.equal(normalizeTitle(null), "");
});

// --- storeItems title dedupe ---------------------------------------------

test("same normalized title from a second feed collapses to one card", () => {
  const feedA = makeFeed("Title Feed A");
  const feedB = makeFeed("Title Feed B");
  store.addFeed(feedA, [
    item("ta-1", "https://example.com/alpha", "Syndicated Story Alpha"),
  ]);
  store.addFeed(feedB, []);
  assert.equal(store.countItems(), 1);

  // Feed B carries the same story: different link, different guid, and
  // the title differs only in case + punctuation — the normalized
  // title is what collapses these (URL dedupe cannot: links differ).
  const rB = store.storeItems(feedB.id, [
    item(
      "tb-1",
      "https://mirror.example.com/alpha-story",
      "syndicated story alpha!",
      "2026-11-11T07:00:00.000Z",
    ),
  ]);
  assert.equal(rB.duplicates, 1);
  assert.equal(rB.inserted, 0);
  assert.equal(store.countItems(), 1, "no second row for the title duplicate");

  const listed = store.listItemsWithSource();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, "Syndicated Story Alpha", "survivor keeps its own title");
  assert.deepEqual(
    listed[0].sources.map((s) => s.title).sort(),
    ["Title Feed A", "Title Feed B"],
    "both feeds recorded as sources",
  );
  const underB = store.listItemsWithSource(feedB.id);
  assert.equal(underB.length, 1);
  assert.equal(underB[0].id, listed[0].id);
});

test("same title outside the 72h window stays two cards", () => {
  const feedA = makeFeed("Window Feed A");
  const feedB = makeFeed("Window Feed B");
  store.addFeed(feedA, [
    item("wa-1", "https://example.com/window", "Window Story One"),
  ]);
  store.addFeed(feedB, []);
  const before = store.countItems();
  store.storeItems(feedB.id, [
    item(
      "wb-1",
      "https://mirror.example.com/window",
      "Window Story One",
      "2026-11-16T06:00:00.000Z", // 5 days later — outside the window
    ),
  ]);
  assert.equal(store.countItems(), before + 1);
});

test("undated incoming item does not title-collapse", () => {
  const feedA = makeFeed("Undated Feed A");
  const feedB = makeFeed("Undated Feed B");
  store.addFeed(feedA, [
    item("ua-1", "https://example.com/undated", "Undated Story One"),
  ]);
  store.addFeed(feedB, []);
  const before = store.countItems();
  store.storeItems(feedB.id, [
    item("ub-1", "https://mirror.example.com/undated", "Undated Story One", null),
  ]);
  assert.equal(store.countItems(), before + 1, "no window to check, so no collapse");
});

test("title duplicate never generates a second summary (Req 4 AC4)", () => {
  const feedA = makeFeed("Title AC4 Feed A");
  const feedB = makeFeed("Title AC4 Feed B");
  store.addFeed(feedA, [
    item("ac4-a1", "https://example.com/ac4", "AC4 Syndicated Story"),
  ]);
  const survivor = store.listItems(feedA.id)[0];
  store.setItemSummary(survivor.id, {
    summary: "Kept summary. It stays put.",
    whyItMatters: "Because it matters.",
  });
  store.addFeed(feedB, []);
  store.storeItems(feedB.id, [
    item(
      "ac4-b1",
      "https://mirror.example.com/ac4",
      "AC4 Syndicated Story",
      "2026-11-11T08:00:00.000Z",
    ),
  ]);
  const after = store.getItemWithSource(survivor.id);
  assert.equal(after.summary, "Kept summary. It stays put.");
  assert.equal(after.whyItMatters, "Because it matters.");
  assert.equal(store.listUnsummaryizedItems(feedB.id).length, 0);
});

test("empty title never title-collapses", () => {
  const feedA = makeFeed("No Title Feed A");
  const feedB = makeFeed("No Title Feed B");
  store.addFeed(feedA, [item("nt-a1", "https://example.com/nt-a", "")]);
  store.addFeed(feedB, []);
  const before = store.countItems();
  store.storeItems(feedB.id, [item("nt-b1", "https://example.com/nt-b", "")]);
  assert.equal(store.countItems(), before + 1);
});

// --- collapseTitleDuplicates (pre-task-24 rows) ---------------------------

test("collapseTitleDuplicates merges legacy title-duplicate rows", () => {
  const db = getDb();
  const feedH = makeFeed("Title Legacy H");
  const feedI = makeFeed("Title Legacy I");
  store.addFeed(feedH, []);
  store.addFeed(feedI, []);
  const insert = db.prepare(
    `INSERT INTO items (id, feedId, guid, canonicalUrl, title, content, publishedAt, read, starred, summary, whyItMatters)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const survivorId = randomUUID();
  insert.run(
    survivorId, feedH.id, "h-1", "https://example.com/legacy-title", "Legacy Title One",
    "", "2026-11-11T05:00:00.000Z", 0, 0, null, null,
  );
  const dupId = randomUUID();
  insert.run(
    dupId, feedI.id, "i-1", "https://mirror.example.com/legacy-title", "legacy title one!",
    "", "2026-11-11T06:00:00.000Z", 0, 1, "Dup summary. Second sentence.",
    "Dup why.",
  );
  const result = store.collapseTitleDuplicates();
  assert.equal(result.groups, 1);
  assert.equal(result.removed, 1);
  assert.equal(
    getDb().prepare("SELECT COUNT(*) AS n FROM items WHERE id = ?").get(dupId).n,
    0,
  );
  const survivor = store.getItemWithSource(survivorId);
  assert.equal(survivor.summary, "Dup summary. Second sentence.");
  assert.equal(survivor.starred, true, "starred merged from the duplicate");
  assert.deepEqual(
    survivor.sources.map((s) => s.title).sort(),
    ["Title Legacy H", "Title Legacy I"],
  );
});

test("collapseTitleDuplicates never merges same-feed or out-of-window rows", () => {
  const db = getDb();
  const feedJ = makeFeed("Title Keep J");
  const feedK = makeFeed("Title Keep K");
  store.addFeed(feedJ, []);
  store.addFeed(feedK, []);
  const insert = db.prepare(
    `INSERT INTO items (id, feedId, guid, canonicalUrl, title, content, publishedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  // Same feed, same title, within the window — Req 4 AC3 keeps both.
  insert.run(randomUUID(), feedJ.id, "j-1", "https://example.com/keep-a", "Keep Me Separate", "", "2026-11-11T06:00:00.000Z");
  insert.run(randomUUID(), feedJ.id, "j-2", "https://example.com/keep-b", "Keep Me Separate", "", "2026-11-11T07:00:00.000Z");
  // Different feeds, same title, 5 days apart — outside the window.
  insert.run(randomUUID(), feedJ.id, "j-3", "https://example.com/keep-c", "Old Window Story", "", "2026-11-11T06:00:00.000Z");
  insert.run(randomUUID(), feedK.id, "k-1", "https://example.com/keep-d", "Old Window Story", "", "2026-11-16T06:00:00.000Z");
  const before = store.countItems();
  const result = store.collapseTitleDuplicates();
  assert.equal(result.groups, 0);
  assert.equal(result.removed, 0);
  assert.equal(store.countItems(), before);
});
