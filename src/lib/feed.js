// src/lib/feed.js — feed fetching + parsing + dedupe helpers.
// Scaffold placeholder. Phase 2 (task 13) implements this with `rss-parser`.
// Interface (see .kiro/mcp/feed-fetch.md):
//   fetchFeed(url) -> { title, siteUrl, items: [{ guid, title, link, publishedAt, contentSnippet }] }
//   normalizeLink(url) -> canonical URL (utm stripped, no trailing slash/fragment)
//   normalizeTitle(title) -> comparison key (trimmed, whitespace collapsed, lowercase)

export function normalizeLink(url) {
  // TODO (Phase 2): strip utm_* params, trailing slash, fragment.
  return url;
}

export function normalizeTitle(title) {
  // TODO (Phase 2): trim, collapse whitespace, lowercase.
  return title;
}

export async function fetchFeed(_url) {
  throw new Error("fetchFeed is not implemented yet (Phase 2, task 13).");
}
