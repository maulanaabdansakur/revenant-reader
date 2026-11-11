// /api/items — list stored stories, newest first (Phase 2, task 17).
// GET ?feed=<feedId> — optional per-feed filter (the sidebar's feed
// selection). Items come from the SQLite store with their feed title
// attached as `source`; ordering is newest-first (undated items last).
// Summaries are null until task 20 generates them; the card shows the
// feed excerpt meanwhile (task 21 fallback behavior).

import { listItemsWithSource } from "@/lib/feeds-store";

export async function GET(request) {
  const feedId = new URL(request.url).searchParams.get("feed") || null;
  return Response.json({ items: listItemsWithSource(feedId) });
}
