// /api/items/[id] — read/unread + star one stored story (Phase 2,
// task 19; design doc API table).
// PATCH { read?: boolean, starred?: boolean } — updates whichever field
// is present and returns the updated item (list shape, with url/source).
// At least one of read/starred must be a boolean (400 otherwise);
// unknown id → 404. State lives in SQLite, so it survives reloads and
// server restarts; re-fetching a feed never resets it (task 16 upsert).

import { updateItem } from "@/lib/feeds-store";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch = {};
  if (typeof body?.read === "boolean") patch.read = body.read;
  if (typeof body?.starred === "boolean") patch.starred = body.starred;
  if (Object.keys(patch).length === 0) {
    return Response.json(
      { error: "Body must include read and/or starred as booleans." },
      { status: 400 },
    );
  }
  const item = updateItem(id, patch);
  if (!item) {
    return Response.json({ error: "Story not found." }, { status: 404 });
  }
  return Response.json({ item });
}
