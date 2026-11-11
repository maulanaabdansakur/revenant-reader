// StoryCard — one story in the reader list: title, source, time, summary,
// "why it matters", read/unread dot, star toggle, duplicate-source chips.
// Phase 2, task 17: wired to real /api/items data — newest-first, relative
// time, unread dot. Summaries arrive in task 20; until then the card shows
// the feed excerpt with a "Summary pending" note (task 21 fallback).
// Read/star toggling is task 19 (star button still shows its notice).

import { formatRelativeTime } from "@/lib/time";

export default function StoryCard({ story, onOpen }) {
  const excerpt = story.summary || story.content || "";
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
      {excerpt && <p style={{ margin: "0.25rem 0" }}>{excerpt}</p>}
      {story.summary ? (
        story.whyItMatters && (
          <p className="why">Why it matters: {story.whyItMatters}</p>
        )
      ) : (
        <p className="muted" style={{ fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
          Summary pending
        </p>
      )}
      <p style={{ margin: "0.5rem 0 0" }}>
        <button type="button" onClick={() => onOpen(story)}>Read</button>{" "}
        <button type="button" onClick={() => alert("Starring lands in Phase 2 (task 19).")}>
          {story.starred ? "★ Starred" : "☆ Star"}
        </button>
      </p>
    </article>
  );
}
