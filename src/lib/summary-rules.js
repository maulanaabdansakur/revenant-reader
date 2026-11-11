// src/lib/summary-rules.js — deterministic enforcement of
// .kiro/steering/summaries.md (Phase 2, task 22).
//
// The prompt (src/lib/summarizer.js) asks the model to follow the rules,
// but a prompt is not enforcement: the model can still return a
// 1-sentence summary, a clickbait word, a question hook, or a number it
// invented. validateSummary() checks a parsed summary against every rule
// that can be checked mechanically and returns the violations;
// summarizeItem() retries once with the violations named and refuses to
// store output that still violates (the caller then marks the story
// summaryPending instead of showing a rule-breaking summary).
//
// Rules that cannot be checked mechanically stay prompt-only and are
// listed in NOT_CHECKABLE so the gap is explicit:
//   - "Do not state a cause unless the source states it" (needs judgment)
//   - "Label opinion pieces" (needs genre detection)
//   - "The headline's claim must match the summary's claim" (needs NLI)
// The numbers/quotes checks below are the checkable part of "never
// invent facts": a digit or a quoted phrase in the summary must appear
// in the source title/content, or it is treated as invented.

export const CLICKBAIT_WORDS = [
  "shocking",
  "you won't believe",
  "you wont believe",
  "breaking",
  "game-changer",
  "game changer",
  "insane",
  "secret",
];

const DIRECT_ADDRESS = [
  /you\s+(should|must|need|won't|wont|will|can|could)\b/i,
  /don't\s+miss/i,
  /do\s+not\s+miss/i,
  /\bstay\s+tuned\b/i,
  /\bread\s+on\b/i,
];

export const NOT_CHECKABLE = [
  "Do not state a cause unless the source states it.",
  "Label opinion pieces ('In an opinion piece, …').",
  "The headline's claim must match the summary's claim.",
];

function normalize(text) {
  return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findClickbait(text, sourceText) {
  const found = [];
  const hay = normalize(text);
  const normSource = normalize(sourceText);
  for (const word of CLICKBAIT_WORDS) {
    if (!hay.includes(word)) continue;
    // "breaking" is allowed when the source itself is a breaking-news
    // wire — the steering doc's one exception. Every other banned word
    // is a violation even if the feed title used it: the summary is
    // supposed to correct a clickbait headline with the facts, not echo it.
    if (word === "breaking" && normSource.includes("breaking")) continue;
    found.push(`clickbait word "${word}"`);
  }
  return found;
}

function findNumbers(text) {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) =>
    n.replace(/,/g, ""),
  );
}

function findQuotes(text) {
  const out = [];
  const re = /["“”]([^"“”]+)["“”]/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

// Sentence splitter shared with the summarizer parser. Abbreviations
// are masked with same-length placeholders so "9 p.m." or "the U.S.
// economy" does not split mid-sentence; the original text is sliced by
// the masked match indices so the output keeps its dots.
export function splitSentences(text) {
  const masked = text.replace(
    /\b([ap]\.m\.|U\.S\.|Mr\.|Mrs\.|Ms\.|Dr\.|e\.g\.|i\.e\.)/gi,
    (m) => m.replace(/\./g, " "),
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

// Check a parsed { summary, whyItMatters } against the steering rules.
// `source` is the full title + content the model was given, so a number
// or quote counts as sourced even when the prompt excerpt was truncated.
// Returns { ok, violations } — violations is a list of human-readable
// reasons, empty when the summary obeys every checkable rule.
export function validateSummary(
  { summary, whyItMatters },
  { title, content },
) {
  const violations = [];
  const source = `${title || ""}\n${content || ""}`;
  const normSource = normalize(source);

  // Length: 2–3 sentences; "why it matters" exactly one line.
  const sentences = splitSentences(summary || "");
  if (sentences.length < 2) {
    violations.push(
      `summary is ${sentences.length} sentence(s), need 2–3`,
    );
  }
  if (sentences.length > 3) {
    violations.push(`summary is ${sentences.length} sentences, max 3`);
  }
  if (!whyItMatters || !whyItMatters.trim()) {
    violations.push(`"why it matters" line is empty`);
  } else {
    if (whyItMatters.includes("\n")) {
      violations.push(`"why it matters" is more than one line`);
    }
    if (normalize(whyItMatters) === normalize(summary)) {
      violations.push(`"why it matters" repeats the summary`);
    }
  }

  // Tone / clickbait / hooks — checked on summary + why line together.
  const body = `${summary || ""}\n${whyItMatters || ""}`;
  violations.push(...findClickbait(body, source));
  if (body.includes("?")) violations.push("question used as a hook");
  for (const re of DIRECT_ADDRESS) {
    if (re.test(body)) {
      violations.push("addresses the reader directly");
      break;
    }
  }

  // Formatting: plain text only, no markdown.
  if (/^\s*[-*]\s/m.test(body)) violations.push("bullet list in summary");
  if (/\[([^\]]+)\]\([^)]+\)/.test(body)) {
    violations.push("markdown link in summary");
  }
  if (/\*\*|__/.test(body)) violations.push("markdown emphasis in summary");
  if (/^#+\s/m.test(body)) violations.push("markdown heading in summary");

  // Accuracy proxies: every number and quoted phrase must come from
  // the source — otherwise the model invented it.
  for (const n of findNumbers(body)) {
    if (!normSource.includes(n)) {
      violations.push(`number "${n}" not in the source`);
    }
  }
  for (const q of findQuotes(body)) {
    if (q && !normSource.includes(normalize(q))) {
      violations.push(`quote "${q}" not in the source`);
    }
  }

  return { ok: violations.length === 0, violations };
}
