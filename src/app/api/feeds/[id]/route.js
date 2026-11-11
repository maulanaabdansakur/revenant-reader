// /api/feeds/[id] — remove a feed (Phase 2, task 14).
// DELETE -> { removed: feed } or 404 when the id is unknown (Req 1 AC3).
// Storage is the interim in-memory store (src/lib/feeds-store.js); task 16
// replaces it with SQLite.

import { removeFeed } from "@/lib/feeds-store";

export async function DELETE(_request, { params }) {
  const { id } = await params;
  const removed = removeFeed(id);
  if (!removed) {
    return Response.json({ error: "Feed not found." }, { status: 404 });
  }
  return Response.json({ removed });
}
