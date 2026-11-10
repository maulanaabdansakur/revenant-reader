# MCP — Feed-fetch tool

**Purpose:** the agent (Kiro, and Kai during this build) needs a reliable way
to fetch and parse RSS/Atom feeds while building and testing Revenant Reader.
This note documents the tool so the build is reproducible and the Devpost
write-up can describe it honestly.

## Tool: `feed-fetch`

A small documented fetch-and-parse helper used by the agent during the build.
In the app it becomes the server-side feed fetcher (`src/lib/feed.ts`,
backed by the `rss-parser` library). During development the same logic is
exercised from the command line / curl against the API routes.

### Interface

```
feed-fetch <url>
  → fetches the URL (10s timeout, browser User-Agent)
  → parses RSS 2.0 or Atom 1.0
  → returns: feed title, site URL, items [{ guid, title, link,
     publishedAt, contentSnippet }]
  → on failure: a clear error (network / not-a-feed / timeout)
```

### Rules

- Never fetch a feed the user has not subscribed to (or asked the agent to
  test) — no drive-by crawling.
- Respect `ETag` / `Last-Modified` where the server provides them; poll at
  most once every 15 minutes per feed in production.
- The tool only reads public feeds. It never sends credentials, cookies, or
  any user data to a feed server.
- Feed content is untrusted input: titles and content are escaped before
  rendering, and links are rendered as plain outbound links.

## MCP server (planned, core-build phase)

If a formal MCP server is added, it exposes exactly one tool — `fetch_feed`
with the interface above — so Kiro can call it as a tool during development
and the app can reuse the same parsing code at runtime. The server is
optional for the MVP: the documented helper above is sufficient, and the
write-up will say so rather than claim an MCP server that does not exist.

## Status (scaffold phase, 2026-11-08)

- Documented here. Implementation lands in Phase 2 (task 13) as
  `src/lib/feed.ts` + `rss-parser`.
