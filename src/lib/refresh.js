// src/lib/refresh.js — feed refresh scheduler (Phase 3, task 27,
// Req 3, 4, 5).
//
// Two phases, both lock-guarded by a module-level flag so a manual
// refresh, the timer, and a Vercel Cron hit can never overlap (the
// summarizer must never be called twice for the same item):
//
//   refreshAllFeeds()      — fetch phase: polls every subscribed feed,
//                            stores new items (dedupe at insert via
//                            storeItems, tasks 23/24), records
//                            lastFetchedAt/lastError per feed. One dead
//                            feed never stops the others. Returns a
//                            per-feed report; the caller (route) returns
//                            it immediately — the fetch phase is fast
//                            (all feeds fetched concurrently, 10s cap
//                            each) while summaries take minutes.
//   summarizePendingFeeds()— summarize phase: runs runSummariesForFeed
//                            per feed, sequentially (Pollinations
//                            rate-limits bursts — task 20), so
//                            previously unsummarized items get summaries
//                            too, not only brand-new arrivals. That
//                            covers the 91 pre-task-20 rows in the dev
//                            DB: each refresh retries them (max 3
//                            attempts) until they land.
//   refreshAndSummarize()  — both phases, for the timer and tests.
//
// The route (POST /api/refresh, GET for Vercel Cron) runs the fetch
// phase in-request and schedules the summarize phase with Next.js
// `after()`, so the response returns immediately and the background
// work still lands on serverless (the task 20 caveat — a plain
// fire-and-forget promise can be cut off when the response is sent).
// The timer (src/instrumentation.js) calls refreshAndSummarize()
// directly on long-running servers (dev + `next start`).

import { fetchFeed } from "./feed.js";
import {
  countItems,
  listFeeds,
  storeItems,
  updateFeedFetchState,
} from "./feeds-store.js";
import { runSummariesForFeed } from "./on-feed-item.js";

// A refresh is already running (manual, timer, or cron overlapping).
// The second caller gets { alreadyRunning: true } instead of starting
// a duplicate run.
let refreshRunning = false;

function tryBeginRefresh() {
  if (refreshRunning) return false;
  refreshRunning = true;
  return true;
}

function endRefresh() {
  refreshRunning = false;
}

// Fetch phase. `deps` is injectable for tests; defaults are the real
// modules. Returns:
//   { alreadyRunning } — when a run is in progress, or
//   { refreshedAt, feeds: [{ feedId, title, url, fetched, inserted,
//     duplicates, error }], totalInserted, totalDuplicates, errors }
export async function refreshAllFeeds(deps = {}) {
  const fetchFeedFn = deps.fetchFeedFn ?? fetchFeed;
  const listFeedsFn = deps.listFeedsFn ?? listFeeds;
  const storeItemsFn = deps.storeItemsFn ?? storeItems;
  const countItemsFn = deps.countItemsFn ?? countItems;
  const updateFeedFetchStateFn =
    deps.updateFeedFetchStateFn ?? updateFeedFetchState;

  if (!tryBeginRefresh()) return { alreadyRunning: true };
  try {
    const refreshedAt = new Date().toISOString();
    const feeds = listFeedsFn();
    // All feeds concurrently: each fetch is independent and capped at
    // 10s by the parser, so the whole phase stays fast.
    const results = await Promise.all(
      feeds.map(async (feed) => {
        const before = countItemsFn(feed.id);
        let parsed;
        try {
          parsed = await fetchFeedFn(feed.url);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          updateFeedFetchStateFn(feed.id, {
            lastFetchedAt: refreshedAt,
            lastError: message,
          });
          console.log(`[refresh] ${feed.title}: fetch failed — ${message}`);
          return {
            feedId: feed.id,
            title: feed.title,
            url: feed.url,
            fetched: 0,
            inserted: 0,
            duplicates: 0,
            error: message,
          };
        }
        // storeItems counts re-fetch upserts as "inserted" too, so
        // brand-new rows are measured by the item count before/after.
        const stored = storeItemsFn(feed.id, parsed.items);
        const inserted = Math.max(0, countItemsFn(feed.id) - before);
        updateFeedFetchStateFn(feed.id, {
          lastFetchedAt: refreshedAt,
          lastError: null,
        });
        return {
          feedId: feed.id,
          title: feed.title,
          url: feed.url,
          fetched: parsed.items.length,
          inserted,
          duplicates: stored.duplicates,
          error: null,
        };
      }),
    );
    return {
      refreshedAt,
      feeds: results,
      totalInserted: results.reduce((n, r) => n + r.inserted, 0),
      totalDuplicates: results.reduce((n, r) => n + r.duplicates, 0),
      errors: results.filter((r) => r.error).length,
    };
  } finally {
    endRefresh();
  }
}

// Summarize phase. Runs the on-feed-item hook's summarize batch for
// every feed, sequentially (rate-limit safety — task 20). Feeds with
// nothing pending are a cheap no-op inside runSummariesForFeed.
// Returns { alreadyRunning } or
// { feeds: [{ feedId, attempted, succeeded, failed }], totalAttempted,
//   totalSucceeded, totalFailed }.
export async function summarizePendingFeeds(deps = {}) {
  const listFeedsFn = deps.listFeedsFn ?? listFeeds;
  const summarizeFeedFn = deps.summarizeFeedFn ?? runSummariesForFeed;

  if (!tryBeginRefresh()) return { alreadyRunning: true };
  try {
    const results = [];
    for (const feed of listFeedsFn()) {
      const r = await summarizeFeedFn(feed.id);
      results.push({ feedId: feed.id, ...r });
    }
    return {
      feeds: results,
      totalAttempted: results.reduce((n, r) => n + (r.attempted ?? 0), 0),
      totalSucceeded: results.reduce((n, r) => n + (r.succeeded ?? 0), 0),
      totalFailed: results.reduce((n, r) => n + (r.failed ?? 0), 0),
    };
  } finally {
    endRefresh();
  }
}

// Both phases (timer entry point): fetch, then summarize. Each phase
// takes/releases the lock separately — a manual refresh landing between
// them just means the summarize phase reports alreadyRunning and the
// pending summaries wait for the next refresh.
export async function refreshAndSummarize(deps = {}) {
  const fetched = await refreshAllFeeds(deps);
  if (fetched.alreadyRunning) return { ...fetched, summaries: null };
  const summaries = await summarizePendingFeeds(deps);
  return { ...fetched, summaries };
}
