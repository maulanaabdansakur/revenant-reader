// /api/items/[id]/summarize — one manual summary retry (Phase 2, task 21).
// POST — makes exactly ONE model attempt for one story (see
// retryItemSummary in src/lib/on-feed-item.js) and returns the updated
// item (list shape, with url/source). This is the single retry path for
// "summary pending" stories: the reader clicks "Retry summary" on a card
// or in the article view, and this endpoint either stores a summary or
// records one more failed attempt. It never loops and never re-calls for
// a story that already has a summary.
//   200 { item }                    — summary stored.
//   502 { item, error }             — the one attempt failed; the item is
//                                     still pending (attempts + 1).
//   409 { item, error }             — already summarized, or attempts
//                                     exhausted (>= 3); no call was made.
//   404 { error }                   — unknown id.

import { retryItemSummary } from "@/lib/on-feed-item";

export async function POST(request, { params }) {
  const { id } = await params;
  const result = await retryItemSummary(id);
  switch (result.status) {
    case "not-found":
      return Response.json({ error: "Story not found." }, { status: 404 });
    case "already-summarized":
      return Response.json(
        { item: result.item, error: "This story already has a summary." },
        { status: 409 },
      );
    case "exhausted":
      return Response.json(
        {
          item: result.item,
          error:
            "No summary attempts left for this story — the model could not summarize it.",
        },
        { status: 409 },
      );
    case "failed":
      return Response.json(
        {
          item: result.item,
          error: `Summary retry failed: ${result.error || "model unavailable."}`,
        },
        { status: 502 },
      );
    case "ok":
    default:
      return Response.json({ item: result.item });
  }
}
