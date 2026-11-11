// src/lib/opml.js — OPML import parsing (Phase 2, task 15).
//
// Extracts feed URLs from an OPML file. OPML outline elements carry the
// feed URL in their `xmlUrl` attribute:
//   <outline text="Hacker News" xmlUrl="https://news.ycombinator.com/rss" />
// Folder outlines have no xmlUrl and are ignored; nested outlines are all
// scanned, so feeds inside folders are imported too.
//
// No XML parser dependency is added for this: OPML is a flat attribute
// format and a focused attribute scan is enough. The extracted URLs are
// validated by the task 13 feed parser (fetchFeed) at import time, so a
// malformed or non-feed URL is reported as skipped, never stored.
//
//   parseOpml(text) -> [{ url, label }]  (url = raw xmlUrl value, label =
//     outline text/title when present)
//   Throws a clean Error when the text is not an OPML document or contains
//   no feed outlines.

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

// Match an attribute value with either quote style: attr="..." or attr='...'.
function attrValue(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = tag.match(re);
  if (!m) return "";
  return decodeEntities((m[1] ?? m[2] ?? "").trim());
}

export function parseOpml(text) {
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("The OPML file is empty.");
  }
  if (!/<opml[\s>]/i.test(text)) {
    throw new Error("That file is not an OPML document.");
  }

  const outlines = [];
  const outlineRe = /<outline\b[^>]*>/gi;
  let m;
  while ((m = outlineRe.exec(text)) !== null) {
    const tag = m[0];
    const xmlUrl = attrValue(tag, "xmlUrl");
    if (!xmlUrl) continue; // folder outline — no feed URL
    const label =
      attrValue(tag, "text") || attrValue(tag, "title") || "";
    outlines.push({ url: xmlUrl, label });
  }

  if (outlines.length === 0) {
    throw new Error("No feeds found in that OPML file.");
  }
  return outlines;
}
