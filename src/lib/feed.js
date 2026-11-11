// src/lib/feed.js — feed fetching + parsing + dedupe helpers.
// Phase 2, task 13: real RSS 2.0 / Atom 1.0 parsing via `rss-parser`.
// Interface (see .kiro/mcp/feed-fetch.md):
//   fetchFeed(url) -> { title, siteUrl, items: [{ guid, title, link, publishedAt, contentSnippet }] }
//   normalizeLink(url) -> canonical URL (tracking params stripped, no trailing slash/fragment)
//   normalizeTitle(title) -> comparison key (lowercase, punctuation
//   stripped, whitespace collapsed, trimmed) — design doc, Dedupe
//   algorithm step 3. Two titles that differ only in case, punctuation
//   or spacing ("City Unveils New Park!" vs "city unveils new park")
//   are the same story for title dedupe (task 24).
//
// Feed content is untrusted input: callers must escape titles/content before
// rendering and render links as plain outbound links. This module never sends
// credentials, cookies, or user data to a feed server.

import Parser from "rss-parser";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "RevenantReader/1.0 (Kiroween 2026; +https://github.com/maulanaabdansakur/revenant-reader)";

// Query params that identify the visit, not the article — stripped when
// canonicalising a link so the same story from two feeds dedupes.
// Two forms: exact tracker names, and prefixes (utm_*, at_* for BBC's
// analytics, mc_*/pk_*/piwik_*/matomo_*/sc_* campaign families). Anything
// else — ?page=2, ?id=123, ?v=... — is article identity and is KEPT, so
// genuinely different articles never collapse (Req 4 AC3).
const TRACKING_PARAM_NAMES = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "wbraid",
  "gbraid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "igshid",
  "yclid",
  "ysmcid",
  "ysmadid",
  "vero_id",
  "vero_conv",
  "_ga",
  "_gl",
  "_gac",
  "srsltid",
  "si",
  "feature",
  "_hsenc",
  "_hsmi",
  "hsctatracking",
  "__hsfp",
  "__hssc",
  "__hstc",
  "__s",
  "_openstat",
  "rb_clickid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "fb_ref",
]);

const TRACKING_PARAM_PREFIXES = [
  "utm_",
  "at_", // BBC: at_medium / at_campaign / at_custom1-4
  "mc_", // Mailchimp
  "pk_", // Piwik/Matomo campaign params
  "piwik_",
  "matomo_",
  "sc_", // Adobe Analytics campaign params
];

function isTrackingParam(name) {
  const key = name.toLowerCase();
  if (TRACKING_PARAM_NAMES.has(key)) return true;
  return TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix));
}

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { "User-Agent": USER_AGENT },
  customFields: {
    item: [["content:encoded", "contentEncoded"]],
  },
});

function stripHtml(text) {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLink(url) {
  if (!url || typeof url !== "string") return "";
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(key)) parsed.searchParams.delete(key);
  }
  // Drop a trailing slash on non-root paths so
  // https://example.com/post/ and https://example.com/post match.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

export function normalizeTitle(title) {
  if (!title || typeof title !== "string") return "";
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toPublishedAt(item) {
  const raw = item.isoDate || item.pubDate || null;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function fetchFeed(url) {
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error("Feed URL is required.");
  }
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error(`"${url}" is not a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Feed URL must start with http:// or https://.");
  }

  let text;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(parsed.toString(), {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
        redirect: "follow",
      });
      if (!res.ok) {
        throw new Error(`Feed server returned HTTP ${res.status}.`);
      }
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Timed out fetching ${parsed.hostname} (10s).`);
    }
    if (err instanceof Error && err.message.startsWith("Feed server returned")) {
      throw err;
    }
    throw new Error(`Could not reach ${parsed.hostname}: ${err?.message || "network error"}`);
  }

  let feed;
  try {
    feed = await parser.parseString(text);
  } catch (err) {
    throw new Error(
      `That URL did not return a valid RSS or Atom feed (${err?.message || "parse error"}).`,
    );
  }
  if (!feed || !Array.isArray(feed.items)) {
    throw new Error("That URL did not return a valid RSS or Atom feed.");
  }

  return {
    title: (feed.title || parsed.hostname || "").trim(),
    siteUrl: normalizeLink(feed.link) || parsed.origin,
    items: feed.items
      .filter((item) => item && (item.title || item.link))
      .map((item) => {
        const link = normalizeLink(item.link || "");
        const snippet = stripHtml(
          item.contentSnippet || item.contentEncoded || item.content || item.summary || "",
        ).slice(0, 280);
        return {
          guid: item.guid || item.id || link || item.title || "",
          title: (item.title || "").trim(),
          link,
          publishedAt: toPublishedAt(item),
          contentSnippet: snippet,
        };
      }),
  };
}
