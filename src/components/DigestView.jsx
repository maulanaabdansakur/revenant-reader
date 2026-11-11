// DigestView — the daily digest: top-10 ranked stories of the last 24h
// (Phase 3, task 26, Req 5). Numbered cards in rank order, using the same
// StoryCard layout as the reader list (plus a rank badge). When fewer
// than 10 stories exist in the last 24h, all available stories are shown
// and the count is stated (Req 5 AC3). Opening a story marks it read —
// the parent passes the same openArticle handler as the reader list
// (Req 5 AC4), so the digest and the list share the read behavior.

"use client";

import Link from "next/link";
import StoryCard from "@/components/StoryCard";

export default function DigestView({
  stories,
  count,
  limit,
  loading,
  error,
  onOpen,
  onToggleStar,
  onToggleRead,
  onRetrySummary,
}) {
  return (
    // Task 28: fade-in on the view transition (reader ↔ digest).
    <div className="fade-in">
      <h2 style={{ marginTop: 0 }}>Daily digest — top 10</h2>
      {error && (
        <p role="alert" style={{ color: "#ff9d9d" }}>{error}</p>
      )}
      {loading && <p className="muted">Ranking the last 24 hours…</p>}
      {!loading && stories !== null && (
        <>
          {stories.length === 0 ? (
            <section className="empty-state" aria-label="Empty digest">
              <p className="empty-glyph" aria-hidden="true">☠</p>
              <h3>Nothing to rank yet</h3>
              <p className="muted">
                No stories from the last 24 hours — add a feed and your
                digest will fill in.
              </p>
              <p>
                <Link href="/">← Back to the reader to add a feed</Link>
              </p>
            </section>
          ) : stories.length < limit ? (
            <p className="muted">
              Showing {count} {count === 1 ? "story" : "stories"} from the
              last 24 hours — fewer than 10 available.
            </p>
          ) : (
            <p className="muted">
              Top {limit} stories from the last 24 hours.
            </p>
          )}
          {stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              rank={story.rank}
              onOpen={onOpen}
              onToggleStar={onToggleStar}
              onToggleRead={onToggleRead}
              onRetrySummary={onRetrySummary}
            />
          ))}
        </>
      )}
    </div>
  );
}
