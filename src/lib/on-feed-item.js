// src/lib/on-feed-item.js — step 3 of .kiro/hooks/on-feed-item.md:
// summarize new items, exactly once per item.
//
// runSummariesForFeed(feedId) finds the feed's items that still need a
// summary (no cached summary, attempts left — see listUnsummaryizedItems),
// summarizes them newest-first with limited concurrency, and stores each
// result (setItemSummary) or records the failure (markItemSummaryPending)
// so the UI shows the excerpt + "Summary pending" instead.
//
// The function resolves when the batch is done, but callers (feed add /
// OPML import) fire it WITHOUT awaiting: a feed with 30 items takes a
// few minutes at ~10-30s per call, and the POST must not block on
// that — summaries land in the background and appear on the next
// refresh. A re-read never triggers a call: items with a cached summary
// are never returned by listUnsummaryizedItems, and the stats counter in
// src/lib/summarizer.js proves it (see the task 20 verification note).
//
// Rate limits: Pollinations 404s bursts — a 10-call burst at
// concurrency 3 failed 6 of them, while the same prompts succeed one
// at a time. So the batch runs at concurrency 2, and failures are
// retried once, sequentially, after a 15s pause. Anything still
// failing stays pending for the next refresh (max 3 attempts per item).
//
// Dedupe (hook steps 1-2) is task 23 and happens at INSERT time in
// storeItems (src/lib/feeds-store.js): a duplicate canonical URL never
// becomes a row, so it never reaches this batch and never triggers a
// summary call (Req 4 AC4). Title dedupe is task 24.

import {
  findItemById,
  getItemWithSource,
  listUnsummaryizedItems,
  setItemSummary,
  markItemSummaryPending,
} from "./feeds-store.js";
import { summarizeItem, SUMMARIZER_CONCURRENCY } from "./summarizer.js";

export async function runSummariesForFeed(feedId) {
  const pending = listUnsummaryizedItems(feedId);
  if (pending.length === 0) return { attempted: 0, succeeded: 0, failed: 0 };
  let attempted = 0;
  let succeeded = 0;

  // One batch pass over `items` with `concurrency` workers. Returns the
  // items that failed (each already marked pending, attempts + 1).
  async function processBatch(items, concurrency) {
    const failed = [];
    const queue = [...items];
    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        attempted += 1;
        try {
          const { summary, whyItMatters } = await summarizeItem({
            title: item.title,
            content: item.content,
          });
          setItemSummary(item.id, { summary, whyItMatters });
          succeeded += 1;
        } catch (err) {
          // Model failure is not fatal: mark pending, keep the excerpt
          // visible, retry on the next refresh (max 3 attempts).
          markItemSummaryPending(item.id);
          failed.push(item);
          console.log(
            `[on-feed-item] summary failed for item ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    );
    await Promise.all(workers);
    return failed;
  }

  // Round 1: newest first, limited concurrency, so the stories the
  // reader sees at the top get summaries first.
  let failed = await processBatch(pending, SUMMARIZER_CONCURRENCY);

  // Round 2 (retry): failures retried once, sequentially, after a 15s
  // pause — the rate limit clears and the same prompts then succeed.
  // Anything still failing stays pending for the next refresh.
  if (failed.length > 0) {
    console.log(
      `[on-feed-item] feed ${feedId}: ${failed.length} failed, retrying sequentially after 15s`,
    );
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    failed = await processBatch(failed, 1);
  }

  console.log(
    `[on-feed-item] feed ${feedId}: ${succeeded}/${pending.length} summaries stored, ${failed.length} pending`,
  );
  return { attempted, succeeded, failed: failed.length };
}

// --- Task 21: single manual retry path ------------------------------------
//
// retryItemSummary(id) makes exactly ONE model attempt for one story and
// returns { status, item, error? }:
//   "ok"                — summary stored, pending flag cleared.
//   "failed"            — the one attempt failed; pending flag + attempts
//                         recorded (markItemSummaryPending), so the UI can
//                         show the excerpt + "Summary pending" again.
//   "already-summarized"— a summary exists (e.g. the background batch got
//                         there first); no model call is made.
//   "exhausted"         — summaryAttempts >= 3; no further attempts, so a
//                         retry can never loop forever.
//   "not-found"         — unknown id.
// The route POST /api/items/[id]/summarize maps these to 200/502/409/404.
// There is no automatic re-queue here: the next attempt comes only from
// an explicit user retry (this function) or the next refresh (task 27).

const MAX_SUMMARY_ATTEMPTS = 3;

export async function retryItemSummary(id) {
  const item = findItemById(id);
  if (!item) return { status: "not-found", item: null };
  if (item.summary) return { status: "already-summarized", item: getItemWithSource(id) };
  if ((item.summaryAttempts ?? 0) >= MAX_SUMMARY_ATTEMPTS) {
    return { status: "exhausted", item: getItemWithSource(id) };
  }
  try {
    const { summary, whyItMatters } = await summarizeItem({
      title: item.title,
      content: item.content,
    });
    return { status: "ok", item: setItemSummary(id, { summary, whyItMatters }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[on-feed-item] manual summary retry failed for item ${id}: ${message}`);
    return { status: "failed", item: markItemSummaryPending(id), error: message };
  }
}
export function summarizeFeedInBackground(feedId) {
  runSummariesForFeed(feedId).catch((err) => {
    console.log(
      `[on-feed-item] background summary batch failed for feed ${feedId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}
