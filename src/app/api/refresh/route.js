// /api/refresh — poll all subscribed feeds (Phase 3, task 27).
// POST -> fetch phase runs in-request (fast: feeds fetched concurrently,
// 10s cap each); the summarize phase is scheduled with Next.js `after()`
// so the response returns immediately AND the background summaries still
// land — on serverless a plain fire-and-forget promise can be cut off
// when the response is sent (the task 20 caveat).
// GET  -> same handler, the Vercel Cron entry point (cron jobs can only
//   issue GETs). Refreshing is idempotent and touches no user data, so
//   no secret is required; the deploy notes in design.md cover this.
// Response: { refreshedAt, feeds: [{ feedId, title, url, fetched,
//   inserted, duplicates, error }], totalInserted, totalDuplicates,
//   errors, summariesQueued: true }.
// 409 when a refresh is already running (manual / timer / cron overlap).

import { after } from "next/server";
import { refreshAllFeeds, summarizePendingFeeds } from "@/lib/refresh";

// The GET handler must never be prerendered at build time — a refresh
// is a live action, not a static page.
export const dynamic = "force-dynamic";

async function handleRefresh() {
  const result = await refreshAllFeeds();
  if (result.alreadyRunning) {
    return Response.json(
      { error: "A refresh is already running — try again in a minute." },
      { status: 409 },
    );
  }
  // Summaries (including the backfill of pre-task-20 unsummarized
  // items) run after the response, kept alive by `after()` on
  // serverless instead of being cut off with the response.
  after(async () => {
    try {
      const summaries = await summarizePendingFeeds();
      if (!summaries.alreadyRunning) {
        console.log(
          `[refresh] summaries: ${summaries.totalSucceeded}/${summaries.totalAttempted} stored, ${summaries.totalFailed} pending`,
        );
      }
    } catch (err) {
      console.log(
        `[refresh] background summarize phase failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
  return Response.json({ ...result, summariesQueued: true });
}

export async function POST() {
  return handleRefresh();
}

export async function GET() {
  return handleRefresh();
}
