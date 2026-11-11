// test/ui-polish.test.js — task 28 (Req 6) CSS guards: responsive layout,
// fade-in animations, empty-state styles, reduced-motion support. These
// are static assertions over src/app/globals.css — they pin the rules
// the responsive + animation work depends on, so a later edit cannot
// silently drop them. Run with `npm test` (node --test).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cssPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "app",
  "globals.css",
);
const css = readFileSync(cssPath, "utf8");

test("responsive: layout stacks at 720px and the main column gets tighter padding", () => {
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /\.layout\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /\.main\s*\{\s*padding:\s*1rem 0\.75rem;/);
});

test("responsive: no horizontal scrolling — grid children can shrink and long strings wrap", () => {
  assert.match(css, /\.sidebar\s*\{[^}]*min-width:\s*0;/);
  assert.match(css, /\.main\s*\{[^}]*min-width:\s*0;/);
  assert.match(css, /\.card\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.match(css, /input\s*\{[^}]*width:\s*100%;/);
});

test("responsive: starter cards stack vertically on phones", () => {
  assert.match(css, /\.starter-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\);/);
  assert.match(css, /\.starter-grid\s*\{\s*grid-template-columns:\s*1fr;/);
});

test("animation: fade-in keyframes exist and are used by view transitions", () => {
  assert.match(css, /@keyframes fade-in/);
  assert.match(css, /\.fade-in\s*\{\s*animation:\s*fade-in 0\.3s ease-out;/);
  // The card rise-in from the scaffold is still there (Req 6 AC3).
  assert.match(css, /@keyframes rise-in/);
  assert.match(css, /\.rise-in\s*\{\s*animation:\s*rise-in 0\.35s ease-out;/);
});

test("animation: reduced-motion users get no entrance animations", () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.rise-in,\s*\.fade-in\s*\{\s*animation:\s*none;/);
});

test("empty state: styles exist for the panel and the starter cards", () => {
  assert.match(css, /\.empty-state\s*\{/);
  assert.match(css, /\.empty-glyph\s*\{/);
  assert.match(css, /\.starter-card\s*\{/);
  assert.match(css, /\.starter-title\s*\{/);
});
