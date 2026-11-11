// src/instrumentation.js — server boot hook (Phase 3, task 27).
// Starts the refresh timer on long-running servers (dev + `next start`
// on the Vultr box): every REFRESH_INTERVAL_MINUTES it polls all feeds
// and summarizes new/pending items (refreshAndSummarize).
//
//   REFRESH_INTERVAL_MINUTES — minutes between polls; default 30.
//   Set to 0 to disable the timer (manual refresh still works).
//
// On Vercel the in-process timer does NOT fire reliably — serverless
// instances freeze between requests, so an interval started at boot
// may never tick. Deploy therefore uses Vercel Cron instead: a cron
// job that GETs /api/refresh (see design.md "Refresh"). The timer is
// still the right mechanism for dev and for the long-running Vultr
// fallback, where the process stays alive.
//
// No refresh runs at boot: the server may start before the user wants
// network traffic — the first tick fires after one interval, and the
// manual "Refresh feeds" button covers "now".

export async function register() {
  // Never start the timer during `next build` (NEXT_PHASE is
  // phase-production-build there) — an interval would keep the build
  // process alive and a refresh at build time would be meaningless.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Instrumentation can also run on the edge runtime; the timer only
  // makes sense on Node (SQLite + setInterval).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const minutes = parseFloat(process.env.REFRESH_INTERVAL_MINUTES ?? "30");
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log("[refresh] timer disabled (REFRESH_INTERVAL_MINUTES=0)");
    return;
  }
  const { refreshAndSummarize } = await import("./lib/refresh.js");
  console.log(`[refresh] timer started: every ${minutes} min`);
  setInterval(() => {
    refreshAndSummarize().catch((err) => {
      console.log(
        `[refresh] scheduled refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }, minutes * 60 * 1000);
}
