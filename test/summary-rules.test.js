// test/summary-rules.test.js — deterministic steering-rule enforcement
// (Phase 2, task 22). Pure unit tests for validateSummary() plus the
// parser behavior it relies on. Run with `npm test` (node --test).
import test from "node:test";
import assert from "node:assert/strict";

import { validateSummary, splitSentences } from "../src/lib/summary-rules.js";
import { parseSummaryResponse } from "../src/lib/summarizer.js";

const SRC = {
  title: "City council approves transit plan",
  content:
    "The city council approved a new transit plan on Tuesday, adding 12 bus routes across the metro area. The plan takes effect next year. The mayor said the plan is \"a step forward for commuters\".",
};

const GOOD_SUMMARY =
  "The city council approved the new transit plan on Tuesday. The plan adds 12 bus routes across the metro area.";
const GOOD_WHY = "Commuters will see shorter waits starting next year.";

function check(summary, whyItMatters, source = SRC) {
  return validateSummary({ summary, whyItMatters }, source);
}

test("valid summary passes every check", () => {
  const r = check(GOOD_SUMMARY, GOOD_WHY);
  assert.equal(r.ok, true, r.violations.join("; "));
  assert.deepEqual(r.violations, []);
});

test("1-sentence summary fails the length rule", () => {
  const r = check("The council approved the transit plan.", GOOD_WHY);
  assert.equal(r.ok, false);
  assert.match(r.violations.join(" "), /1 sentence/);
});

test("4-sentence summary fails the length rule (before truncation)", () => {
  const r = check(
    "First sentence here. Second sentence here. Third sentence here. Fourth sentence here.",
    GOOD_WHY,
  );
  assert.equal(r.ok, false);
  assert.match(r.violations.join(" "), /4 sentences/);
});

test("clickbait words are violations", () => {
  for (const word of ["shocking", "insane", "game-changer", "secret"]) {
    const r = check(
      `The council approved a ${word} transit plan on Tuesday. The plan adds 12 bus routes.`,
      GOOD_WHY,
    );
    assert.equal(r.ok, false, word);
    assert.match(r.violations.join(" "), new RegExp(word));
  }
});

test('"breaking" is a violation unless the source is a breaking-news wire', () => {
  const r = check(
    "This is a breaking development in the transit plan. The council approved it on Tuesday.",
    GOOD_WHY,
  );
  assert.equal(r.ok, false);
  assert.match(r.violations.join(" "), /breaking/);

  const wire = {
    title: "Breaking: council approves transit plan",
    content: "Breaking news from the wire. " + SRC.content,
  };
  const r2 = check(
    "This is a breaking development in the transit plan. The council approved it on Tuesday.",
    GOOD_WHY,
    wire,
  );
  assert.equal(r2.ok, true, r2.violations.join("; "));
});

test("a question used as a hook is a violation", () => {
  const r = check(
    "The council approved the transit plan on Tuesday. But what does it mean for riders?",
    GOOD_WHY,
  );
  assert.equal(r.ok, false);
  assert.match(r.violations.join(" "), /question/);
});

test("addressing the reader directly is a violation", () => {
  for (const line of [
    "You should read the full plan before Tuesday. The council approved it yesterday.",
    "Don't miss the new bus routes. The council approved the plan on Tuesday.",
  ]) {
    const r = check(line, GOOD_WHY);
    assert.equal(r.ok, false, line);
    assert.match(r.violations.join(" "), /reader directly/);
  }
});

test("markdown in a summary is a violation", () => {
  const r = check(
    "The council approved the plan. See [the full plan](https://example.com) for details.",
    GOOD_WHY,
  );
  assert.equal(r.ok, false);
  assert.match(r.violations.join(" "), /markdown link/);

  const r2 = check(
    "The council approved the plan on Tuesday.\n- 12 new bus routes",
    GOOD_WHY,
  );
  assert.equal(r2.ok, false);
  assert.match(r2.violations.join(" "), /bullet list/);
});

test("a number not in the source is treated as invented", () => {
  const r = check(
    "The council approved the plan with 50 new bus routes on Tuesday. The vote was unanimous.",
    GOOD_WHY,
  );
  assert.equal(r.ok, false);
  assert.match(r.violations.join(" "), /number "50" not in the source/);
});

test("a number from the source passes", () => {
  const r = check(GOOD_SUMMARY, GOOD_WHY);
  assert.equal(r.ok, true, r.violations.join("; "));
});

test("a quote not in the source is treated as invented", () => {
  const r = check(
    'The council approved the plan on Tuesday. The mayor called it "the best day in city history".',
    GOOD_WHY,
  );
  assert.equal(r.ok, false);
  assert.match(r.violations.join(" "), /quote .* not in the source/);
});

test("a quote from the source passes", () => {
  const r = check(
    'The council approved the plan on Tuesday. The mayor said the plan is "a step forward for commuters".',
    GOOD_WHY,
  );
  assert.equal(r.ok, true, r.violations.join("; "));
});

test('"why it matters" must be exactly one non-empty line, not a copy', () => {
  assert.match(check(GOOD_SUMMARY, "").violations.join(" "), /empty/);
  assert.match(
    check(GOOD_SUMMARY, "Line one.\nLine two.").violations.join(" "),
    /more than one line/,
  );
  assert.match(
    check(GOOD_SUMMARY, GOOD_SUMMARY).violations.join(" "),
    /repeats the summary/,
  );
});

test("splitSentences does not split on 9 p.m. or U.S.", () => {
  assert.deepEqual(
    splitSentences("The meeting is at 9 p.m. in the U.S. Capitol. It ended late."),
    ["The meeting is at 9 p.m. in the U.S. Capitol.", "It ended late."],
  );
});

test("parser truncates a 4-sentence summary to 3 and the result passes", () => {
  const parsed = parseSummaryResponse(
    "First sentence here. Second sentence here. Third sentence here. Fourth sentence here.\nWHY IT MATTERS: It matters.",
  );
  assert.equal(parsed.sentenceCount, 3);
  const r = check(parsed.summary, parsed.whyItMatters);
  assert.equal(r.ok, true, r.violations.join("; "));
});
