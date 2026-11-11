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
// Task 23: items are ALSO deduped by canonicalUrl across feeds at insert
// time (storeItems) — a story arriving from a second feed collapses onto
// the surviving row and the extra feed is recorded in item_sources.
// Task 24 adds title dedupe (design doc step 3): same normalized title
// from a DIFFERENT feed within 72h collapses the same way. Same-feed
// same-title items stay separate (Req 4 AC3 — e.g. a feed re-using a
// title for different articles), as do matches outside the 72h window
// and undated items (the window cannot be checked without dates).
// Deleting a feed cascades to its items (FK ON DELETE CASCADE).
//
// Persistence: feeds + items live in data/revenant-reader.db (gitignored)
// and survive a server restart. For the Postgres migration path, see the
// design doc — the functions below map 1:1 to the same SQL on `pg`.

import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { normalizeLink, normalizeTitle } from "./feed.js";

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
    summaryAttempts: row.summaryAttempts ?? 0,
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

// Task 27: record a refresh attempt on a feed — lastFetchedAt is set on
// every attempt, lastError carries the fetch failure message (or null
// when the fetch succeeded). The UI does not show these yet; they are
// for the refresh report and for diagnosing a dead feed.
export function updateFeedFetchState(id, { lastFetchedAt, lastError }) {
  getDb()
    .prepare("UPDATE feeds SET lastFetchedAt = ?, lastError = ? WHERE id = ?")
    .run(lastFetchedAt ?? null, lastError ?? null, id);
  return findFeedById(id);
}

export function addFeed(feed, items = []) {
  const db = getDb();
  const insertFeed = db.prepare(
    "INSERT INTO feeds (id, url, title, siteUrl, addedAt, lastFetchedAt, lastError) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  // Items are stored by the exported storeItems() below (task 23 dedupe).
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
    storeItems(feed.id, items);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return feed;
}

// --- Dedupe (task 23, Req 4) ------------------------------------------------
//
// storeItems inserts parsed items for one feed, collapsing duplicates by
// canonical URL at insert time (design doc, Dedupe algorithm step 2):
//   * Same canonical URL already stored from ANOTHER feed → duplicate:
//     no second row is inserted (one card per story), the new feed is
//     recorded in item_sources as an additional source (task 24 renders
//     the chips), and the surviving row is left completely untouched —
//     its summary, read/star state and publishedAt stay as-is (Req 4
//     AC4: no second summary is ever generated for a duplicate).
//   * Same canonical URL, same feed, different guid (the feed re-issued
//     the item under a new id) → same collapse, no new row.
//   * Same (feedId, guid) re-fetch → the existing upsert updates
//     title/content/publishedAt but never resets read/star/summary.
//     The re-fetch check runs FIRST, so a re-fetched item whose URL
//     changed is never wrongly collapsed onto another feed's row.
//   * Same normalized title, DIFFERENT feed, published within 72h of
//     each other (task 24, design doc step 3) → duplicate: no second
//     row, the new feed is recorded in item_sources, survivor untouched
//     (Req 4 AC4 — no second summary). The 72h window is the pairwise
//     difference of the two publishedAt values, so syndication is
//     caught whenever the feeds are added, not only within 72h of now.
//   * Same title, different URL, SAME feed → NOT a duplicate (Req 4
//     AC3): a feed re-using a title for different articles keeps both
//     cards. Same title outside the 72h window, or either item
//     undated, also stays separate — the window cannot be verified.
//   * Empty title → no title dedupe is possible.
// Returns { inserted, duplicates } so callers (and tests) can see what
// collapsed. The task 27 refresh will call this directly per feed.
export function storeItems(feedId, items = []) {
  const db = getDb();
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
  const findByFeedGuid = db.prepare(
    "SELECT * FROM items WHERE feedId = ? AND guid = ? LIMIT 1",
  );
  const findByCanonicalUrl = db.prepare(
    "SELECT * FROM items WHERE canonicalUrl = ? AND canonicalUrl != '' LIMIT 1",
  );
  // Title-dedupe candidates: dated items whose publishedAt falls within
  // ±72h of the incoming item's (the pairwise window, checked exactly
  // in JS below); the normalized-title comparison itself is JS-only.
  const findTitleCandidates = db.prepare(
    `SELECT * FROM items
     WHERE title != '' AND publishedAt IS NOT NULL
       AND publishedAt >= ? AND publishedAt <= ?
     ORDER BY rowid ASC`,
  );
  const attachSource = db.prepare(
    "INSERT OR IGNORE INTO item_sources (itemId, feedId) VALUES (?, ?)",
  );
  let inserted = 0;
  let duplicates = 0;
  for (const item of items) {
    const guid = item.guid || item.link || item.title || "";
    if (!guid) continue;
    const canonicalUrl = normalizeLink(item.link || "") || "";
    // Re-fetch of an already-stored item: refresh in place (upsert
    // below), never dedupe it against another feed's row.
    if (findByFeedGuid.get(feedId, guid)) {
      upsertItem.run(
        randomUUID(),
        feedId,
        guid,
        canonicalUrl,
        item.title || "",
        item.contentSnippet || "",
        item.publishedAt || null,
      );
      inserted += 1;
      continue;
    }
    if (canonicalUrl) {
      const existing = findByCanonicalUrl.get(canonicalUrl);
      if (existing) {
        if (existing.feedId !== feedId) {
          attachSource.run(existing.id, feedId);
        }
        // Either way the story already has its one card: do not
        // insert a second row, do not touch the survivor (AC4).
        duplicates += 1;
        continue;
      }
    }
    // Title dedupe (task 24): same normalized title, different feed,
    // both dated, published within 72h of each other.
    const normalizedTitle = normalizeTitle(item.title || "");
    const publishedAt = item.publishedAt || null;
    if (normalizedTitle && publishedAt) {
      const publishedMs = new Date(publishedAt).getTime();
      if (!Number.isNaN(publishedMs)) {
        const windowMs = TITLE_DEDUPE_WINDOW_MS;
        const candidates = findTitleCandidates.all(
          new Date(publishedMs - windowMs).toISOString(),
          new Date(publishedMs + windowMs).toISOString(),
        );
        const survivor = candidates.find(
          (row) =>
            row.feedId !== feedId &&
            normalizeTitle(row.title) === normalizedTitle,
        );
        if (survivor) {
          attachSource.run(survivor.id, feedId);
          // Survivor untouched — summary, read/star, publishedAt
          // stay as-is (AC4), so no second summary is generated.
          duplicates += 1;
          continue;
        }
      }
    }
    upsertItem.run(
      randomUUID(),
      feedId,
      guid,
      canonicalUrl,
      item.title || "",
      item.contentSnippet || "",
      item.publishedAt || null,
    );
    inserted += 1;
  }
  return { inserted, duplicates };
}

// Title-dedupe window (task 24): two stories with the same normalized
// title collapse only when their publishedAt values are within 72h of
// each other (design doc, Dedupe algorithm step 3).
export const TITLE_DEDUPE_WINDOW_MS = 72 * 3600 * 1000;

// Feeds that carried one story: the item's own feed first, then any
// additional feeds recorded by the task 23 dedupe. Task 24 renders
// these as multi-source chips on the surviving card.
export function listItemSources(itemId) {
  const db = getDb();
  const item = db
    .prepare("SELECT feedId FROM items WHERE id = ?")
    .get(itemId);
  if (!item) return [];
  const rows = db
    .prepare(
      `SELECT feeds.id AS feedId, feeds.title AS title, feeds.siteUrl AS siteUrl
       FROM item_sources
       JOIN feeds ON feeds.id = item_sources.feedId
       WHERE item_sources.itemId = ?
       ORDER BY feeds.title ASC`,
    )
    .all(itemId);
  const own = db
    .prepare("SELECT id AS feedId, title, siteUrl FROM feeds WHERE id = ?")
    .get(item.feedId);
  const sources = own
    ? [{ feedId: own.feedId, title: own.title, siteUrl: own.siteUrl }]
    : [];
  for (const row of rows) {
    if (!sources.some((s) => s.feedId === row.feedId)) sources.push(row);
  }
  return sources;
}

// One-time cleanup for rows that duplicated BEFORE task 23 (e.g. a DB
// built by tasks 16–22, where the same story could land once per feed).
// Groups items by non-empty canonicalUrl, keeps the earliest-inserted
// row per group as the survivor, records the other feeds as additional
// sources, merges read/starred (OR) and the summary (the survivor keeps
// its own; if it has none, it inherits the first duplicate's), then
// deletes the extra rows. Returns { groups, removed }.
export function collapseDuplicateItems() {
  const db = getDb();
  const groups = db
    .prepare(
      `SELECT canonicalUrl, COUNT(*) AS n FROM items
       WHERE canonicalUrl != ''
       GROUP BY canonicalUrl HAVING n > 1`,
    )
    .all();
  let removed = 0;
  const attachSource = db.prepare(
    "INSERT OR IGNORE INTO item_sources (itemId, feedId) VALUES (?, ?)",
  );
  for (const { canonicalUrl } of groups) {
    const rows = db
      .prepare(
        "SELECT * FROM items WHERE canonicalUrl = ? ORDER BY rowid ASC",
      )
      .all(canonicalUrl);
    const survivor = rows[0];
    const extras = rows.slice(1);
    db.exec("BEGIN");
    try {
      for (const extra of extras) {
        attachSource.run(survivor.id, extra.feedId);
        // Merge state onto the survivor before deleting the extra row.
        if (extra.read === 1 || extra.starred === 1) {
          db.prepare(
            `UPDATE items SET read = MAX(read, ?), starred = MAX(starred, ?)
             WHERE id = ?`,
          ).run(extra.read, extra.starred, survivor.id);
        }
        if (!survivor.summary && extra.summary) {
          db.prepare(
            `UPDATE items SET summary = ?, whyItMatters = ?, summaryPending = 0
             WHERE id = ?`,
          ).run(extra.summary, extra.whyItMatters, survivor.id);
          survivor.summary = extra.summary;
        }
        db.prepare("DELETE FROM items WHERE id = ?").run(extra.id);
        removed += 1;
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return { groups: groups.length, removed };
}

// One-time cleanup for rows that duplicated by TITLE before task 24
// (same design as collapseDuplicateItems above, but for the title rule).
// Groups rows by normalized title; a later-inserted row merges into the
// earliest-inserted row only when its feed differs AND the two
// publishedAt values are within 72h of each other. Same-feed rows and
// out-of-window rows are never merged (Req 4 AC3 boundary). State merges
// the same way (read/starred OR, summary inherited when the survivor has
// none). Returns { groups, removed }.
export function collapseTitleDuplicates() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM items
       WHERE title != '' AND publishedAt IS NOT NULL
       ORDER BY rowid ASC`,
    )
    .all();
  const attachSource = db.prepare(
    "INSERT OR IGNORE INTO item_sources (itemId, feedId) VALUES (?, ?)",
  );
  const removedIds = new Set();
  let groups = 0;
  let removed = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const survivor = rows[i];
    if (removedIds.has(survivor.id)) continue;
    const key = normalizeTitle(survivor.title);
    if (!key) continue;
    const t = new Date(survivor.publishedAt).getTime();
    if (Number.isNaN(t)) continue;
    let absorbed = 0;
    // Only LATER rows can merge into this survivor, so the
    // earliest-inserted row always wins (same rule as the URL merge).
    for (let j = i + 1; j < rows.length; j += 1) {
      const other = rows[j];
      if (removedIds.has(other.id)) continue;
      if (other.feedId === survivor.feedId) continue;
      if (normalizeTitle(other.title) !== key) continue;
      const ot = new Date(other.publishedAt).getTime();
      if (Number.isNaN(ot)) continue;
      if (Math.abs(ot - t) > TITLE_DEDUPE_WINDOW_MS) continue;
      db.exec("BEGIN");
      try {
        attachSource.run(survivor.id, other.feedId);
        if (other.read === 1 || other.starred === 1) {
          db.prepare(
            `UPDATE items SET read = MAX(read, ?), starred = MAX(starred, ?)
             WHERE id = ?`,
          ).run(other.read, other.starred, survivor.id);
        }
        if (!survivor.summary && other.summary) {
          db.prepare(
            `UPDATE items SET summary = ?, whyItMatters = ?, summaryPending = 0
             WHERE id = ?`,
          ).run(other.summary, other.whyItMatters, survivor.id);
          survivor.summary = other.summary;
        }
        db.prepare("DELETE FROM items WHERE id = ?").run(other.id);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      removedIds.add(other.id);
      removed += 1;
      absorbed += 1;
    }
    if (absorbed > 0) groups += 1;
  }
  return { groups, removed };
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
// `opts` adds the task 19 filters: starred (true = starred only,
// false = unstarred only) and read (true/false) — null means no filter.
export function listItemsWithSource(feedId = null, opts = {}) {
  const db = getDb();
  const where = [];
  const values = [];
  if (feedId) {
    // A story belongs to the filter when its own feed matches OR the
    // feed carried it as an additional source (task 23 dedupe) — the
    // story is still one row, so the list never shows it twice.
    where.push(
      `(items.feedId = ? OR EXISTS (SELECT 1 FROM item_sources WHERE item_sources.itemId = items.id AND item_sources.feedId = ?))`,
    );
    values.push(feedId, feedId);
  }
  if (typeof opts.starred === "boolean") {
    where.push("items.starred = ?");
    values.push(opts.starred ? 1 : 0);
  }
  if (typeof opts.read === "boolean") {
    where.push("items.read = ?");
    values.push(opts.read ? 1 : 0);
  }
  const query = `
    SELECT items.*, feeds.title AS sourceTitle, feeds.siteUrl AS sourceSiteUrl
    FROM items LEFT JOIN feeds ON feeds.id = items.feedId
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY items.publishedAt IS NULL, items.publishedAt DESC, items.id ASC
  `;
  const rows = db.prepare(query).all(...values);
  return rows.map((row) => ({
    ...rowToItem(row),
    // UI shape: `url` is the canonical link (StoryCard/ArticleView read
    // story.url); `source` is the feed title. `sources` lists every feed
    // that carried the story (task 23 dedupe; task 24 renders the chips).
    url: row.canonicalUrl,
    source: row.sourceTitle || "Unknown feed",
    siteUrl: row.sourceSiteUrl || "",
    sources: listItemSources(row.id),
  }));
}

export function countItems(feedId = null) {
  const db = getDb();
  const row = feedId
    ? db.prepare("SELECT COUNT(*) AS n FROM items WHERE feedId = ?").get(feedId)
    : db.prepare("SELECT COUNT(*) AS n FROM items").get();
  return row.n;
}

// Find one item by id (plain row shape, no source attached).
export function findItemById(id) {
  return rowToItem(
    getDb().prepare("SELECT * FROM items WHERE id = ?").get(id),
  );
}

// Same item shape the list endpoint returns (url + source attached).
export function getItemWithSource(id) {
  const row = getDb()
    .prepare(
      `SELECT items.*, feeds.title AS sourceTitle, feeds.siteUrl AS sourceSiteUrl
       FROM items LEFT JOIN feeds ON feeds.id = items.feedId
       WHERE items.id = ?`,
    )
    .get(id);
  if (!row) return null;
  return {
    ...rowToItem(row),
    url: row.canonicalUrl,
    source: row.sourceTitle || "Unknown feed",
    siteUrl: row.sourceSiteUrl || "",
    sources: listItemSources(row.id),
  };
}

// Persist a read/star change (task 19). `patch` may carry read and/or
// starred booleans; anything else is ignored. Returns the updated item
// (list shape) or null when the id is unknown. A patch with neither
// field is a no-op read of the current state.
export function updateItem(id, patch) {
  const db = getDb();
  const sets = [];
  const values = [];
  if (typeof patch?.read === "boolean") {
    sets.push("read = ?");
    values.push(patch.read ? 1 : 0);
  }
  if (typeof patch?.starred === "boolean") {
    sets.push("starred = ?");
    values.push(patch.starred ? 1 : 0);
  }
  if (sets.length === 0) return getItemWithSource(id);
  db.prepare(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
    id,
  );
  return getItemWithSource(id);
}

// --- Summaries (task 20) -------------------------------------------------
//
// setItemSummary stores a generated summary + "why it matters" and clears
// the pending flag. markItemSummaryPending records a failed model attempt
// (pending = 1, attempts + 1); the on-feed-item hook retries such items
// on the next refresh, up to 3 attempts, then leaves them pending.
// listUnsummaryizedItems returns the items of a feed that still need a
// summary (none cached, attempts left), newest first — the summarizer
// works through them in that order so the stories the reader sees first
// get summaries first.

export function setItemSummary(id, { summary, whyItMatters }) {
  getDb()
    .prepare(
      "UPDATE items SET summary = ?, whyItMatters = ?, summaryPending = 0 WHERE id = ?",
    )
    .run(summary, whyItMatters, id);
  return getItemWithSource(id);
}

export function markItemSummaryPending(id) {
  getDb()
    .prepare(
      "UPDATE items SET summaryPending = 1, summaryAttempts = summaryAttempts + 1 WHERE id = ?",
    )
    .run(id);
  return getItemWithSource(id);
}

export function listUnsummaryizedItems(feedId, limit = 100) {
  const rows = getDb()
    .prepare(
      `SELECT * FROM items
       WHERE feedId = ? AND summary IS NULL AND summaryAttempts < 3
       ORDER BY publishedAt IS NULL, publishedAt DESC, id ASC
       LIMIT ?`,
    )
    .all(feedId, limit);
  return rows.map(rowToItem);
}
