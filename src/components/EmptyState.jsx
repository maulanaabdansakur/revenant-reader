// EmptyState — the reader's empty state (task 28, Req 6 AC4). Shown in
// the main area when the user has no feeds yet: an inviting message plus
// the three starter feeds, each addable with one click. Adding goes
// through the parent's onAddFeed, which POSTs to /api/feeds — the normal
// add path, so feed validation and duplicate rejection still apply.

"use client";

import { STARTER_FEEDS } from "@/lib/starter-feeds";

export default function EmptyState({ onAddFeed, busy }) {
  return (
    <section className="empty-state rise-in" aria-label="Empty newsroom">
      <p className="empty-glyph" aria-hidden="true">☠</p>
      <h3>Your newsroom is empty — for now</h3>
      <p className="muted">
        RSS is dead. Long live RSS. Add a feed below and the dead will rise
        — every new story summarized, deduped and ranked for you.
      </p>
      <p className="muted">Or start with a classic:</p>
      <div className="starter-grid">
        {STARTER_FEEDS.map((feed) => (
          <button
            key={feed.url}
            type="button"
            className="starter-card"
            onClick={() => onAddFeed?.(feed.url)}
            disabled={busy}
            title={feed.url}
          >
            <span className="starter-title">+ {feed.title}</span>
            <span className="starter-blurb">{feed.blurb}</span>
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        You can also paste any RSS / Atom URL in the sidebar, or import an
        OPML file.
      </p>
    </section>
  );
}
