// FeedList — sidebar: subscribed feeds, add-feed form, OPML import.
// Phase 2, task 14: wired to /api/feeds (list/add/remove). When no feeds
// exist yet, the three starter feeds are offered as one-click suggestions
// (Req 6 AC4). OPML import lands in task 15.

"use client";

import { useEffect, useState } from "react";

const STARTER_FEEDS = [
  { title: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { title: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { title: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
];

export default function FeedList({ activeFeed, onSelect }) {
  const [feeds, setFeeds] = useState(null); // null = loading
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  async function refresh() {
    try {
      const res = await fetch("/api/feeds");
      const data = await res.json();
      setFeeds(Array.isArray(data.feeds) ? data.feeds : []);
    } catch {
      setError("Could not load the feed list.");
      setFeeds([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addFeed(feedUrl) {
    const target = (feedUrl ?? url).trim();
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not add that feed.");
        return;
      }
      setUrl("");
      await refresh();
    } catch {
      setError("Could not reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFeed(id) {
    setRemovingId(id);
    setError("");
    try {
      const res = await fetch(`/api/feeds/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Could not remove that feed.");
        return;
      }
      if (activeFeed === id) onSelect(null);
      await refresh();
    } catch {
      setError("Could not reach the server — try again.");
    } finally {
      setRemovingId(null);
    }
  }

  const loading = feeds === null;
  const empty = !loading && feeds.length === 0;

  return (
    <aside className="sidebar">
      <h1 className="brand">
        <span className="glyph">☠</span> Revenant Reader
      </h1>
      <p className="tagline">RSS, risen from the dead — an AI newsroom.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addFeed();
        }}
      >
        <input
          type="url"
          placeholder="Paste an RSS / Atom URL…"
          aria-label="Feed URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <button type="submit" style={{ marginTop: "0.5rem" }} disabled={busy}>
          {busy ? "Checking…" : "+ Add feed"}
        </button>
      </form>
      {error && (
        <p role="alert" style={{ color: "#ff9d9d", fontSize: "0.9rem" }}>
          {error}
        </p>
      )}

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
      {loading && <p className="muted">Loading feeds…</p>}
      {!loading && (
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
          {feeds.map((feed) => (
            <li
              key={feed.id}
              style={{
                marginTop: "0.4rem",
                display: "flex",
                gap: "0.4rem",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(feed.id)}
                style={{
                  flex: 1,
                  textAlign: "left",
                  borderColor: activeFeed === feed.id ? "var(--accent)" : undefined,
                }}
                title={feed.url}
              >
                {feed.title}
              </button>
              <button
                type="button"
                aria-label={`Remove ${feed.title}`}
                title={`Remove ${feed.title}`}
                onClick={() => removeFeed(feed.id)}
                disabled={removingId === feed.id}
                style={{ flex: "0 0 auto", padding: "0.4rem 0.6rem" }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {empty && (
        <>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            No feeds yet — try a starter:
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {STARTER_FEEDS.map((feed) => (
              <li key={feed.url} style={{ marginTop: "0.4rem" }}>
                <button
                  type="button"
                  onClick={() => addFeed(feed.url)}
                  disabled={busy}
                  title={feed.url}
                >
                  + {feed.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
