"use client";

// ArticleView — full story view: title, source, published time, summary,
// "why it matters", link to the original. Phase 2, task 18: full wiring —
// absolute published time next to the relative time, source linked to the
// feed's site, and a guarded original link. Task 21 (fallback): when no
// summary exists the excerpt is shown instead with an explicit
// "Summary pending" note ONLY when the model actually failed
// (story.summaryPending) — a fresh story whose background batch is still
// running shows just the excerpt. A pending story gets a single "Retry
// summary" button (POST /api/items/[id]/summarize, one attempt, bounded
// by the 3-attempt cap); when attempts are exhausted the note becomes
// "Summary unavailable" and the button disappears, so a retry can never
// loop. Phase 2, task 19: star + mark read/unread buttons (persisted via
// PATCH /api/items/[id], handled by the parent). Phase 2, task 24:
// multi-source chips (SourceChips) show every additional feed that
// carried the story.

import { useState } from "react";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/time";
import SourceChips from "@/components/SourceChips";

export default function ArticleView({ story, onBack, onToggleStar, onToggleRead, onRetrySummary }) {
  const [retrying, setRetrying] = useState(false);
  if (!story) return null;
  const hasSummary = Boolean(story.summary);
  const absolute = formatAbsoluteTime(story.publishedAt);
  const relative = formatRelativeTime(story.publishedAt);
  const timeText =
    absolute === "Unknown time" || relative === "Unknown time"
      ? "Unknown time"
      : `${relative} · ${absolute}`;
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
      <p>
        <button type="button" onClick={onBack}>
          ← Back to list
        </button>
      </p>
      <h2 style={{ marginTop: 0 }}>{story.title}</h2>
      <div className="meta">
        {story.siteUrl ? (
          <a href={story.siteUrl} target="_blank" rel="noreferrer">
            {story.source}
          </a>
        ) : (
          story.source
        )}{" "}
        · {timeText}
      </div>
      <SourceChips sources={story.sources} label="Also carried by" />
      {hasSummary ? (
        <>
          <p>{story.summary}</p>
          {story.whyItMatters && (
            <p className="why">Why it matters: {story.whyItMatters}</p>
          )}
        </>
      ) : (
        <>
          {story.content ? (
            <p>{story.content}</p>
          ) : (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              No excerpt available from this feed.
            </p>
          )}
          {story.summaryPending && !exhausted && (
            <p
              className="muted"
              style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}
            >
              Summary pending — showing the feed excerpt for now.{" "}
              <button type="button" onClick={handleRetry} disabled={retrying}>
                {retrying ? "Retrying…" : "Retry summary"}
              </button>
            </p>
          )}
          {exhausted && (
            <p
              className="muted"
              style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}
            >
              Summary unavailable — the model could not summarize this story.
            </p>
          )}
        </>
      )}
      <p>
        {story.url ? (
          <a href={story.url} target="_blank" rel="noreferrer">
            Read the original →
          </a>
        ) : (
          <span className="muted">
            This feed did not provide a link to the original article.
          </span>
        )}
      </p>
      <p>
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
