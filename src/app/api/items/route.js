// /api/items — list stored stories, newest first (Phase 2, task 17).
// GET ?feed=<feedId> — optional per-feed filter (the sidebar's feed
// selection). ?starred=1 — starred-only filter (task 19). ?read=1 /
// ?read=0 — read / unread-only filter (task 19, design doc API table).
// Items come from the SQLite store with their feed title attached as
// `source`; ordering is newest-first (undated items last).
// Summaries are null until task 20 generates them; the card shows the
// feed excerpt meanwhile (task 21 fallback behavior).

import { listItemsWithSource } from "@/lib/feeds-store";

function parseBoolParam(value) {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return null;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const feedId = params.get("feed") || null;
  const starred = parseBoolParam(params.get("starred"));
  const read = parseBoolParam(params.get("read"));
  return Response.json({
    items: listItemsWithSource(feedId, { starred, read }),
  });
}
