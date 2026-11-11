// src/lib/summarizer.js — one LLM call per new story item (Phase 2, task 20).
//
// Provider: Pollinations.ai text API — keyless, no signup, $0.
//   GET https://text.pollinations.ai/<url-encoded prompt>?model=openai
// Chosen because it is the only reliable keyless free-tier text endpoint
// that works from this app's server: verified live 2026-11-11 (3/3 calls
// succeeded, ~9-10s each, output followed the requested format exactly).
// No API key is used by this provider; SUMMARIZER_API_KEY in .env.example
// stays reserved for a future provider swap. The base URL and model are
// overridable for tests or a swap:
//   SUMMARIZER_BASE_URL (default https://text.pollinations.ai)
//   SUMMARIZER_MODEL    (default openai)
//   SUMMARIZER_TIMEOUT_MS (default 60000)
//   SUMMARIZER_CONCURRENCY (default 3)
//
// Rules: the prompt encodes .kiro/steering/summaries.md (2-3 sentences,
// neutral tone, no clickbait, no invented facts, one "why it matters"
// line). The result is cached in the items table (summary /
// whyItMatters) and never re-called for the same story — callers must
// only pass items with no cached summary (see listUnsummaryizedItems).
// On any failure the caller marks the item summaryPending instead of
// retrying inline (hook: retry on next refresh, max 3 attempts).
// One exception: a summary shorter than 2 sentences is retried once
// with a firmer prompt (the model sometimes over-compresses); the retry
// result is then accepted as-is, so an item costs 1 call normally,
// 2 at most.
//
// GET (not POST) is used deliberately: it is all Pollinations needs, and
// it keeps the call working from sandboxed environments that block POST
// bodies.

const BASE_URL =
  process.env.SUMMARIZER_BASE_URL || "https://text.pollinations.ai";
const MODEL = process.env.SUMMARIZER_MODEL || "openai";
const TIMEOUT_MS = Number(process.env.SUMMARIZER_TIMEOUT_MS || 60_000);
export const SUMMARIZER_CONCURRENCY = Number(
  process.env.SUMMARIZER_CONCURRENCY || 2,
);

// In-process call stats (process lifetime). The dev-server log + these
// stats are how "no second call for the same story" is verified: a
// re-read must not move `calls`.
const stats = { calls: 0, successes: 0, failures: 0, lastError: null };

export function getSummarizerStats() {
  return { ...stats };
}

// Prompt built from title + feed excerpt, steering rules baked in.
// The model must answer in a strict two-part format so the result can be
// parsed without a second call:
//   <2-3 sentences of plain summary>
//   WHY IT MATTERS: <one line>
export function buildSummaryPrompt(title, excerpt, firm = false) {
  const safeTitle = (title || "").trim().slice(0, 200);
  const safeExcerpt = (excerpt || "").trim().slice(0, 600);
  return [
    "Summarize the news story below in exactly 2-3 sentences of plain",
    "neutral text, no markdown, no emojis, no clickbait words like",
    "\"shocking\", \"breaking\", \"game-changer\" or \"insane\".",
    ...(firm
      ? [
          "IMPORTANT: write two or three sentences, not one — do not",
          "compress the story into a single sentence.",
        ]
      : []),
    "Use only facts from the story — never invent facts, numbers, quotes",
    "or names. If the story is vague, say details are unconfirmed. If it",
    "is an opinion piece, start with \"In an opinion piece, \".",
    "Then on a new line write exactly \"WHY IT MATTERS: \" followed by",
    "one single line stating why this story matters.",
    "",
    `Title: ${safeTitle}`,
    `Story: ${safeExcerpt}`,
  ].join("\n");
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#+\s*/gm, "")
    // The model sometimes writes "9 p. m." — rejoin a.m./p.m.
    .replace(/\b([ap])\.\s*m\./gi, "$1.m.")
    .trim();
}

function splitSentences(text) {
  // Mask abbreviations with same-length placeholders so "9 p.m." or
  // "the U.S. economy" does not split mid-sentence; slice the original
  // text by the masked match indices so the output keeps its dots.
  const masked = text.replace(
    /\b([ap]\.m\.|U\.S\.|Mr\.|Mrs\.|Ms\.|Dr\.|e\.g\.|i\.e\.)/gi,
    (m) => m.replace(/\./g, ""),
  );
  const re = /[^.!?]+[.!?]+["')\]]*\s*/g;
  const out = [];
  let m;
  let end = 0;
  while ((m = re.exec(masked)) !== null) {
    const piece = text.slice(m.index, m.index + m[0].length).trim();
    if (piece) out.push(piece);
    end = m.index + m[0].length;
  }
  // Trailing fragment without a terminator (e.g. a cut-off line).
  const tail = text.slice(end).trim();
  if (tail) out.push(tail);
  if (out.length === 0) return text.trim() ? [text.trim()] : [];
  return out;
}

// Parse the strict two-part format. Throws when the model did not follow
// it (caller treats that as a failed call -> summaryPending). A summary
// longer than 3 sentences is truncated at the sentence boundary — the
// steering rule is 2-3 sentences, no more (task 22 formalizes this
// check; this keeps over-long output off the card meanwhile).
export function parseSummaryResponse(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Summarizer returned an empty response.");
  }
  const marker = text.search(/WHY IT MATTERS:/i);
  if (marker === -1) {
    throw new Error("Summarizer response had no WHY IT MATTERS line.");
  }
  const rawSummary = stripMarkdown(text.slice(0, marker)).trim();
  const rawWhy = stripMarkdown(
    text
      .slice(marker)
      .replace(/WHY IT MATTERS:/i, "")
      .split("\n")[0],
  ).trim();
  if (!rawSummary) {
    throw new Error("Summarizer response had an empty summary.");
  }
  if (!rawWhy) {
    throw new Error("Summarizer response had an empty WHY IT MATTERS line.");
  }
  const sentences = splitSentences(rawSummary);
  const kept = sentences.slice(0, 3);
  return { summary: kept.join(" "), whyItMatters: rawWhy, sentenceCount: kept.length };
}

// One model call for one item. Returns { summary, whyItMatters }.
// Throws on network error, non-200, timeout, or unparseable output.
//
// One retry: the model sometimes compresses a story into a single
// sentence despite the prompt. A 1-sentence summary breaks the steering
// rule (2-3 sentences), so a short result is retried once with a firmer
// prompt. If the retry also comes back short, its result is accepted
// anyway (a short summary beats none); if the retry fails outright, the
// first result is kept. So an item costs 1 call normally, 2 at most —
// the cached result is still never re-called (see on-feed-item.js).
export async function summarizeItem({ title, content }) {
  const first = await callModel(buildSummaryPrompt(title, content));
  if (first.sentenceCount >= 2) return finish(first);
  console.log(
    `[summarizer] short summary (${first.sentenceCount} sentence) — one retry with firmer prompt`,
  );
  try {
    const second = await callModel(buildSummaryPrompt(title, content, true));
    return finish(second);
  } catch (err) {
    console.log(
      `[summarizer] retry failed, keeping first result: ${err instanceof Error ? err.message : String(err)}`,
    );
    return finish(first);
  }
}

function finish(parsed) {
  return { summary: parsed.summary, whyItMatters: parsed.whyItMatters };
}

async function callModel(prompt) {
  const url = `${BASE_URL.replace(/\/$/, "")}/${encodeURIComponent(prompt)}?model=${encodeURIComponent(MODEL)}&private=true`;
  const started = Date.now();
  stats.calls += 1;
  const callNo = stats.calls;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Summarizer returned HTTP ${res.status}.`);
    }
    const text = await res.text();
    const parsed = parseSummaryResponse(text);
    stats.successes += 1;
    console.log(
      `[summarizer] call #${callNo} ok in ${Date.now() - started}ms (${parsed.sentenceCount} sentences)`,
    );
    return parsed;
  } catch (err) {
    stats.failures += 1;
    stats.lastError = err instanceof Error ? err.message : String(err);
    console.log(
      `[summarizer] call #${callNo} failed in ${Date.now() - started}ms: ${stats.lastError}`,
    );
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
