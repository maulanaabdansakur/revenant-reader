// src/lib/feeds-store.js — SQLite-backed feed + item store (Phase 2, task 16).
//
// Task 16 replaces the task 14 interim in-memory Map with SQLite (local dev).
// The feed interface is unchanged — listFeeds / findByUrl / addFeed /
// removeFeed — so the API routes and UI did not need to change, except that
// addFeed now takes the feed's parsed items as an optional second argument
// and stores them atomically with the feed.
//
// Feed shape follows .kiro/specs/revenant-reader/design.md:
//   { id, url, title, siteUrl, addedAt, lastFetchedAt, lastError }
// Item shape (same doc):
//   { id, feedId, guid, canonicalUrl, title, content, publishedAt,
//     read, starred, summary, whyItMatters, summaryPending, duplicateOf }
// Items are upserted by (feedId, guid): re-fetching a feed updates the
// stored title/content but never resets read/star state or the summary.
// Deleting a feed cascades to its items (FK ON DELETE CASCADE).
//
// Persistence: feeds + items live in data/revenant-reader.db (gitignored)
// and survive a server restart. For the Postgres migration path, see the
// design doc — the functions below map 1:1 to the same SQL on `pg`.

import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { normalizeLink } from "./feed.js";

function rowToFeed(row) {
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    siteUrl: row.siteUrl,
    addedAt: row.addedAt,
    lastFetchedAt: row.lastFetchedAt,
    lastError: row.lastError,
  };
}

function rowToItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    feedId: row.feedId,
    guid: row.guid,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    content: row.content,
    publishedAt: row.publishedAt,
    read: row.read === 1,
    starred: row.starred === 1,
    summary: row.summary,
    whyItMatters: row.whyItMatters,
    summaryPending: row.summaryPending === 1,
    duplicateOf: row.duplicateOf,
  };
}

export function listFeeds() {
  return getDb()
    .prepare("SELECT * FROM feeds ORDER BY addedAt ASC, id ASC")
    .all()
    .map(rowToFeed);
}

export function findByUrl(normalizedUrl) {
  return rowToFeed(
    getDb().prepare("SELECT * FROM feeds WHERE url = ?").get(normalizedUrl),
  );
}

export function findFeedById(id) {
  return rowToFeed(getDb().prepare("SELECT * FROM feeds WHERE id = ?").get(id));
}

export function addFeed(feed, items = []) {
  const db = getDb();
  const insertFeed = db.prepare(
    "INSERT INTO feeds (id, url, title, siteUrl, addedAt, lastFetchedAt, lastError) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const upsertItem = db.prepare(`
    INSERT INTO items
      (id, feedId, guid, canonicalUrl, title, content, publishedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(feedId, guid) DO UPDATE SET
      canonicalUrl = excluded.canonicalUrl,
      title = excluded.title,
      content = excluded.content,
      publishedAt = excluded.publishedAt
  `);
  const storeItems = (parsedItems) => {
    for (const item of parsedItems) {
      const guid = item.guid || item.link || item.title || "";
      if (!guid) continue;
      upsertItem.run(
        randomUUID(),
        feed.id,
        guid,
        normalizeLink(item.link || "") || "",
        item.title || "",
        item.contentSnippet || "",
        item.publishedAt || null,
      );
    }
  };
  // node:sqlite has no .transaction() helper (better-sqlite3 does) — use
  // explicit BEGIN/COMMIT so feed + items land atomically.
  db.exec("BEGIN");
  try {
    insertFeed.run(
      feed.id,
      feed.url,
      feed.title,
      feed.siteUrl,
      feed.addedAt,
      feed.lastFetchedAt ?? null,
      feed.lastError ?? null,
    );
    storeItems(items);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return feed;
}

export function removeFeed(id) {
  const feed = findFeedById(id);
  if (!feed) return null;
  getDb().prepare("DELETE FROM feeds WHERE id = ?").run(id);
  return feed;
}

export function listItems(feedId = null) {
  const db = getDb();
  // `publishedAt IS NULL` sorts undated items last (SQLite puts NULLs
  // first under plain DESC); newest dated item first, ties by id.
  const rows = feedId
    ? db
        .prepare(
          "SELECT * FROM items WHERE feedId = ? ORDER BY publishedAt IS NULL, publishedAt DESC, id ASC",
        )
        .all(feedId)
    : db
        .prepare(
          "SELECT * FROM items ORDER BY publishedAt IS NULL, publishedAt DESC, id ASC",
        )
        .all();
  return rows.map(rowToItem);
}

// Same as listItems, but with the feed's title attached as `source`
// (and its site URL) so the story list can show where each story came
// from without a second round-trip. Used by GET /api/items (task 17).
export function listItemsWithSource(feedId = null) {
  const db = getDb();
  const query = `
    SELECT items.*, feeds.title AS sourceTitle, feeds.siteUrl AS sourceSiteUrl
    FROM items LEFT JOIN feeds ON feeds.id = items.feedId
    ${feedId ? "WHERE items.feedId = ?" : ""}
    ORDER BY items.publishedAt IS NULL, items.publishedAt DESC, items.id ASC
  `;
  const rows = feedId
    ? db.prepare(query).all(feedId)
    : db.prepare(query).all();
  return rows.map((row) => ({
    ...rowToItem(row),
    // UI shape: `url` is the canonical link (StoryCard/ArticleView read
    // story.url); `source` is the feed title.
    url: row.canonicalUrl,
    source: row.sourceTitle || "Unknown feed",
    siteUrl: row.sourceSiteUrl || "",
  }));
}

export function countItems(feedId = null) {
  const db = getDb();
  const row = feedId
    ? db.prepare("SELECT COUNT(*) AS n FROM items WHERE feedId = ?").get(feedId)
    : db.prepare("SELECT COUNT(*) AS n FROM items").get();
  return row.n;
}
