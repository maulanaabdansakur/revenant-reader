// /api/feeds — list + add feeds (Phase 2, task 14; SQLite store task 16).
// GET  -> { feeds: [...] }
// POST -> { url } — fetches + parses the URL with the task 13 parser, so a
//   URL that is not a parseable feed is rejected with a clean error (422);
//   an already-subscribed URL is reported as a duplicate (409, Req 1 AC5).
// Storage is SQLite (src/lib/feeds-store.js, task 16): the feed and its
// parsed items are stored atomically, and survive a server restart.

import { randomUUID } from "node:crypto";
import { fetchFeed, normalizeLink } from "@/lib/feed";
import { listFeeds, findByUrl, addFeed } from "@/lib/feeds-store";
import { summarizeFeedInBackground } from "@/lib/on-feed-item";

export async function GET() {
  return Response.json({ feeds: listFeeds() });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return Response.json({ error: "Feed URL is required." }, { status: 400 });
  }

  const url = normalizeLink(rawUrl);
  if (!url) {
    return Response.json(
      { error: `"${rawUrl}" is not a valid http(s) URL.` },
      { status: 400 },
    );
  }

  const existing = findByUrl(url);
  if (existing) {
    return Response.json(
      {
        error: `Already subscribed to "${existing.title || url}".`,
        feed: existing,
      },
      { status: 409 },
    );
  }

  // Verify the URL is a real, parseable feed before storing it (Req 1 AC1-2).
  let parsed;
  try {
    parsed = await fetchFeed(url);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not fetch that feed." },
      { status: 422 },
    );
  }

  const feed = addFeed(
    {
      id: randomUUID(),
      url,
      title: parsed.title || url,
      siteUrl: parsed.siteUrl || url,
      addedAt: new Date().toISOString(),
      lastFetchedAt: new Date().toISOString(),
      lastError: null,
    },
    parsed.items,
  );
  // Task 20: summarize the new items in the background (one LLM call per
  // new item, cached; ~10s per call, so the POST must not wait for it).
  // Summaries land within ~a minute and appear on the next refresh.
  summarizeFeedInBackground(feed.id);
  return Response.json({ feed }, { status: 201 });
}
