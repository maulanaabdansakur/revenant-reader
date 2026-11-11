// FeedList — sidebar: subscribed feeds, add-feed form, OPML import.
// Phase 2, task 14: wired to /api/feeds (list/add/remove). Task 15: OPML
// import via /api/feeds/import (file input + added/skipped report). When no
// feeds exist yet, the three starter feeds are offered as one-click
// suggestions (Req 6 AC4) — the list lives in src/lib/starter-feeds.js,
// shared with the main-area EmptyState (task 28). Task 28: accepts a
// `refreshSignal` prop — bumped by the parent after a starter feed is
// added from the main-area empty state, so the sidebar list re-fetches.

"use client";

import { useEffect, useState } from "react";
import { STARTER_FEEDS } from "@/lib/starter-feeds";

export default function FeedList({ activeFeed, onSelect, onFeedsChanged, refreshSignal }) {
  const [feeds, setFeeds] = useState(null); // null = loading
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState(null); // { addedCount, skipped: [{url, reason}] }
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
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

  // Task 28: re-fetch when the parent signals a feed was added outside
  // this sidebar (starter feed from the main-area empty state).
  useEffect(() => {
    if (refreshSignal) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

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
      onFeedsChanged?.();
    } catch {
      setError("Could not reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function importOpml(file) {
    if (!file) return;
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/feeds/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not import that OPML file.");
        return;
      }
      setImportResult({
        addedCount: data.addedCount ?? 0,
        skippedCount: data.skippedCount ?? 0,
        skipped: Array.isArray(data.skipped) ? data.skipped : [],
      });
      await refresh();
      onFeedsChanged?.();
    } catch {
      setError("Could not reach the server — try again.");
    } finally {
      setImporting(false);
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
      onFeedsChanged?.();
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
        <label
          htmlFor="opml-file"
          style={{
            display: "inline-block",
            cursor: importing ? "wait" : "pointer",
            border: "1px solid var(--border, #2a332a)",
            borderRadius: "0.4rem",
            padding: "0.4rem 0.6rem",
          }}
        >
          {importing ? "Importing…" : "Import OPML"}
        </label>
        <input
          id="opml-file"
          type="file"
          accept=".opml,.xml,application/xml,text/xml"
          style={{ display: "none" }}
          disabled={importing}
          onChange={(e) => {
            importOpml(e.target.files?.[0]);
            // Reset so the same file can be picked again after a fix.
            e.target.value = "";
          }}
        />{" "}
        <a href="/digest">Daily digest</a>
      </p>
      {importResult && (
        <p role="status" style={{ fontSize: "0.9rem" }}>
          Imported {importResult.addedCount} feed
          {importResult.addedCount === 1 ? "" : "s"}
          {importResult.skippedCount > 0 &&
            `, skipped ${importResult.skippedCount}:`}
          {importResult.skippedCount === 0 && "."}
        </p>
      )}
      {importResult?.skipped?.length > 0 && (
        <ul style={{ fontSize: "0.85rem", color: "#ff9d9d", paddingLeft: "1rem" }}>
          {importResult.skipped.map((s) => (
            <li key={s.url}>
              {s.url} — {s.reason}
            </li>
          ))}
        </ul>
      )}

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
                  minWidth: 0,
                  overflowWrap: "anywhere",
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
