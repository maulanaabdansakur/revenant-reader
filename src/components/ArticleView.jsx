// ArticleView — full story view: title, source, published time, summary,
// "why it matters", link to the original. Phase 2, task 18: full wiring —
// absolute published time next to the relative time, an explicit
// "Summary pending" note when no summary exists yet (the excerpt is shown
// instead, task 21 fallback; summaries themselves are task 20), source
// linked to the feed's site, and a guarded original link. Phase 2,
// task 19: star + mark read/unread buttons (persisted via PATCH
// /api/items/[id], handled by the parent).

import { formatAbsoluteTime, formatRelativeTime } from "@/lib/time";

export default function ArticleView({ story, onBack, onToggleStar, onToggleRead }) {
  if (!story) return null;
  const hasSummary = Boolean(story.summary);
  const absolute = formatAbsoluteTime(story.publishedAt);
  const relative = formatRelativeTime(story.publishedAt);
  const timeText =
    absolute === "Unknown time" || relative === "Unknown time"
      ? "Unknown time"
      : `${relative} · ${absolute}`;
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
      {hasSummary ? (
        <>
          <p>{story.summary}</p>
          {story.whyItMatters && (
            <p className="why">Why it matters: {story.whyItMatters}</p>
          )}
        </>
      ) : (
        <>
          {story.content && <p>{story.content}</p>}
          <p
            className="muted"
            style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}
          >
            Summary pending — showing the feed excerpt for now.
          </p>
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
