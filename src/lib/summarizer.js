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
// One exception: a summary that breaks a steering rule is retried once
// with the violations named in a firmer prompt; if the retry still
// breaks a rule, the call THROWS (no rule-breaking summary is ever
// stored) — the item stays summaryPending and the excerpt is shown
// (task 21 fallback). So an item costs 1 call normally, 2 at most.
//
// GET (not POST) is used deliberately: it is all Pollinations needs, and
// it keeps the call working from sandboxed environments that block POST
// bodies.
//
// Enforcement (task 22): the prompt alone is not enforcement. Every
// parsed result is checked by validateSummary() in
// src/lib/summary-rules.js (length, clickbait, hooks, markdown,
// invented numbers/quotes); see summarizeItem() below.

import { splitSentences, validateSummary } from "./summary-rules.js";

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
export function buildSummaryPrompt(title, excerpt, firm = false, violations = []) {
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
    ...(violations.length > 0
      ? [
          "Your previous summary broke these steering rules — fix all of",
          `them this time: ${violations.join("; ")}.`,
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

// Parse the strict two-part format. Throws when the model did not follow
// it (caller treats that as a failed call -> summaryPending). A summary
// longer than 3 sentences is truncated at the sentence boundary — the
// steering rule is 2-3 sentences, no more. The remaining rules are
// enforced by validateSummary() in the caller (summarizeItem), not here.
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
// Throws on network error, non-200, timeout, unparseable output, or a
// summary that still breaks a steering rule after the one retry.
//
// Enforcement (task 22): the first result is validated against the
// steering rules (validateSummary). If it breaks a rule, it is retried
// once with a firmer prompt that NAMES the violations, so the model can
// fix exactly what was wrong. If the retry still breaks a rule — or the
// retry call itself fails — the error is thrown and NO summary is
// stored: the caller marks the story summaryPending and the excerpt is
// shown (task 21 fallback). A rule-breaking summary is never stored,
// even if that means the story waits for the next refresh. An item
// costs 1 call normally, 2 at most — the cached result is still never
// re-called (see on-feed-item.js).
export async function summarizeItem({ title, content }) {
  const first = await callModel(buildSummaryPrompt(title, content));
  const firstCheck = validateSummary(first, { title, content });
  if (firstCheck.ok) return finish(first);
  console.log(
    `[summarizer] first summary broke steering rules (${firstCheck.violations.join("; ")}) — one retry with the violations named`,
  );
  const second = await callModel(
    buildSummaryPrompt(title, content, true, firstCheck.violations),
  );
  const secondCheck = validateSummary(second, { title, content });
  if (secondCheck.ok) return finish(second);
  throw new Error(
    `Summary broke steering rules: ${secondCheck.violations.join("; ")}`,
  );
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
