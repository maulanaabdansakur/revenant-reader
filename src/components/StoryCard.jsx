"use client";

// StoryCard — one story in the reader list: title, source, time, summary,
// "why it matters", read/unread dot, star toggle, duplicate-source chips.
// Phase 2, task 17: wired to real /api/items data — newest-first, relative
// time, unread dot. Summaries arrive in task 20; task 21 (fallback):
// when no summary exists the card shows the feed excerpt cleanly with a
// "Summary pending" note ONLY when the model actually failed
// (story.summaryPending) — a fresh story whose background batch is still
// running shows just the excerpt. A pending story gets a single "Retry
// summary" button (POST /api/items/[id]/summarize, one attempt, bounded
// by the 3-attempt cap); when attempts are exhausted the note becomes
// "Summary unavailable" and the button disappears, so a retry can never
// loop. Phase 2, task 19: the star button toggles the persisted starred
// state and the read button toggles the persisted read state (both via
// PATCH /api/items/[id], handled by the parent).

import { useState } from "react";
import { formatRelativeTime } from "@/lib/time";

export default function StoryCard({ story, onOpen, onToggleStar, onToggleRead, onRetrySummary }) {
  const [retrying, setRetrying] = useState(false);
  const hasSummary = Boolean(story.summary);
  const excerpt = story.content || "";
  const exhausted =
    !hasSummary && (story.summaryAttempts ?? 0) >= 3;

  async function handleRetry() {
    if (retrying || !onRetrySummary) return;
    setRetrying(true);
    try {
      await onRetrySummary(story);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <article className="card rise-in">
      <h3>
        {story.read ? null : <span className="unread-dot" title="Unread" />}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onOpen(story);
          }}
        >
          {story.title}
        </a>
      </h3>
      <div className="meta">
        {story.source} · {formatRelativeTime(story.publishedAt)}
        {story.duplicateSources?.length > 1
          ? ` · also in: ${story.duplicateSources.slice(1).join(", ")}`
          : ""}
      </div>
      {hasSummary ? (
        <>
          <p style={{ margin: "0.25rem 0" }}>{story.summary}</p>
          {story.whyItMatters && (
            <p className="why">Why it matters: {story.whyItMatters}</p>
          )}
        </>
      ) : (
        <>
          {excerpt ? (
            <p style={{ margin: "0.25rem 0" }}>{excerpt}</p>
          ) : (
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0.25rem 0" }}>
              No excerpt available from this feed.
            </p>
          )}
          {story.summaryPending && !exhausted && (
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
              Summary pending — showing the feed excerpt.{" "}
              <button type="button" onClick={handleRetry} disabled={retrying}>
                {retrying ? "Retrying…" : "Retry summary"}
              </button>
            </p>
          )}
          {exhausted && (
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
              Summary unavailable — the model could not summarize this story.
            </p>
          )}
        </>
      )}
      <p style={{ margin: "0.5rem 0 0" }}>
        <button type="button" onClick={() => onOpen(story)}>Read</button>{" "}
        <button type="button" onClick={() => onToggleStar?.(story)}>
          {story.starred ? "★ Starred" : "☆ Star"}
        </button>{" "}
        <button type="button" onClick={() => onToggleRead?.(story)}>
          {story.read ? "Mark unread" : "Mark read"}
        </button>
      </p>
    </article>
  );
}
