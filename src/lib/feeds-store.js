// src/lib/feeds-store.js — interim in-memory feed store (Phase 2, task 14).
//
// INTERIM ONLY: feeds live in a module-level Map, so they are lost when the
// dev server restarts. Task 16 replaces this file with SQLite persistence
// (feeds + items survive a restart); the store interface below (listFeeds /
// addFeed / removeFeed / findByUrl) is kept small on purpose so task 16 can
// swap the backing store without touching the API routes or the UI.
//
// Feed shape follows .kiro/specs/revenant-reader/design.md:
//   { id, url, title, siteUrl, addedAt, lastFetchedAt, lastError }

const feeds = new Map(); // id -> feed

export function listFeeds() {
  return [...feeds.values()].sort((a, b) =>
    a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0,
  );
}

export function findByUrl(normalizedUrl) {
  for (const feed of feeds.values()) {
    if (feed.url === normalizedUrl) return feed;
  }
  return null;
}

export function addFeed(feed) {
  feeds.set(feed.id, feed);
  return feed;
}

export function removeFeed(id) {
  const feed = feeds.get(id);
  if (!feed) return null;
  feeds.delete(id);
  return feed;
}
