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
// Dedupe (hook steps 1-2) is tasks 23-24 and is intentionally not done
// here: until then every new item is summarized once.

import {
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

// Fire-and-forget wrapper for API routes: starts the batch and logs an
// unexpected top-level error instead of crashing the request. The route
// itself has already returned by the time summaries land.
export function summarizeFeedInBackground(feedId) {
  runSummariesForFeed(feedId).catch((err) => {
    console.log(
      `[on-feed-item] background summary batch failed for feed ${feedId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}
