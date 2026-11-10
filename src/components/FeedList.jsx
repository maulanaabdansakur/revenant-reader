// FeedList — sidebar: subscribed feeds, add-feed form, OPML import.
// Phase 2 wires this to /api/feeds. Scaffold: static starter feeds.

const STARTER_FEEDS = [
  { id: "hn", title: "Hacker News", url: "https://news.ycombinator.com/rss", unread: 3 },
  { id: "bbc", title: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", unread: 5 },
  { id: "verge", title: "The Verge", url: "https://www.theverge.com/rss/index.xml", unread: 2 },
];

export default function FeedList({ activeFeed, onSelect }) {
  return (
    <aside className="sidebar">
      <h1 className="brand">
        <span className="glyph">☠</span> Revenant Reader
      </h1>
      <p className="tagline">RSS, risen from the dead — an AI newsroom.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          alert("Feed adding lands in Phase 2 (task 14).");
        }}
      >
        <input type="url" placeholder="Paste an RSS / Atom URL…" aria-label="Feed URL" />
        <button type="submit" style={{ marginTop: "0.5rem" }}>+ Add feed</button>
      </form>

      <p style={{ marginTop: "1rem" }}>
        <button
          type="button"
          onClick={() => alert("OPML import lands in Phase 2 (task 15).")}
        >
          Import OPML
        </button>{" "}
        <a href="/digest">Daily digest</a>
      </p>

      <h2 style={{ fontSize: "0.95rem", color: "var(--muted)" }}>Feeds</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            style={activeFeed === null ? { borderColor: "var(--accent)" } : undefined}
          >
            All feeds
          </button>
        </li>
        {STARTER_FEEDS.map((feed) => (
          <li key={feed.id} style={{ marginTop: "0.4rem" }}>
            <button
              type="button"
              onClick={() => onSelect(feed.id)}
              style={activeFeed === feed.id ? { borderColor: "var(--accent)" } : undefined}
            >
              {feed.title} ({feed.unread})
            </button>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Scaffold data — real feeds arrive in Phase 2.
      </p>
    </aside>
  );
}
