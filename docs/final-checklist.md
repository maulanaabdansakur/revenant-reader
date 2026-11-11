# Revenant Reader — Final checklist (task 33)

**Checked:** 2026-11-11 ~15:30 WIB, by the task 33 run (all items below were
re-verified live today unless marked otherwise).
**Deadline:** submit on Devpost before **5 Dec 2026 05:00 WIB** (task 34).
**Live demo:** http://167.179.88.69:3000
**Repo:** https://github.com/maulanaabdansakur/revenant-reader (master = `3cbc0f2` at check time)

Status key: ✅ pass · ⚠️ partial (works, known limitation) · 🔲 blocked on the user · ❌ fail (none)

## 1. Kiro app present and functional — ✅ PASS

- `/.kiro/` at the repo root, committed, **not** gitignored (`.gitignore`
  says so explicitly):
  - `.kiro/specs/revenant-reader/requirements.md`, `design.md`, `tasks.md`
  - `.kiro/steering/summaries.md` (43 lines)
  - `.kiro/hooks/on-feed-item.md` (43 lines)
  - `.kiro/mcp/feed-fetch.md` (48 lines)
- The build actually follows the spec: tasks 1–32 done and pushed; the
  steering rules are enforced mechanically by `src/lib/summary-rules.js`
  (task 22), not just written in a prompt.

## 2. Public repo — ✅ PASS (topics not re-verified from this VM)

- Public repo `maulanaabdansakur/revenant-reader`, branch `master`, local
  HEAD = `origin/master` = `3cbc0f2`, clean tree.
- `README.md` (project, category, live URL, deploy notes, "How Kiro was
  used", run instructions), `LICENSE` — MIT, Copyright (c) 2026 Maulana
  Abdan Sakur.
- Topics were set when the repo was created (task 12 record). They were
  **not re-verified from this VM** (no GitHub web/API access here) — check
  them on github.com at submit time.
- The demo video binary is deliberately **not** in the repo (18.8 MB);
  it lives in `~/workspace/revenant-reader-video/`.

## 3. Live demo reachable and functional — ✅ PASS

Verified live today on http://167.179.88.69:3000:

| Check | Result |
|---|---|
| Home `/` | 200 |
| Digest page `/digest` | 200 |
| `GET /api/feeds` | 200 — 3 starter feeds (Hacker News, BBC News, The Verge) |
| `GET /api/digest` | 200 — count 9, ranks 1–9, per-feed 3/3/3 (cap respected), 9/9 with summaries |
| `GET /api/items` | 200 — 71 items, 62 summarized, 9 pending (see §6) |
| Refresh timer | `lastFetchedAt` advancing on the live DB (30-min timer firing) |

- Persistence: verified in task 29 by an actual `docker restart` — same
  3 feeds + items intact (SQLite on a host-mounted volume).
- Deploy note: this is the **Vultr fallback**. Vercel is not connected in
  this environment (needs the owner's sign-in + Neon/Supabase Postgres);
  the README and write-up say so honestly. The app is fully usable as-is.

## 4. Demo video < 3 min — ✅ PASS

- File: `~/workspace/revenant-reader-video/revenant-reader-demo.mp4`
  (not committed to the repo).
- `ffprobe` re-checked today: **160.3 s (2:40)**, 1280×720, 30 fps,
  H.264 + AAC, 18,768,871 bytes. Full decode check clean (`ffmpeg -f null -`,
  no errors).
- Content: assembled narrated slideshow from real screenshots of the real
  app (beats 1–5 on the live URL, beats 6–7 on a throwaway local server
  per the demo script, beat 8 title card), TTS narration, following
  `docs/demo-script.md` beat for beat. Honest limitation, documented in
  the video README and the write-up: it is **not** a continuous screen
  recording (no screen-recorder setup exists on this VM).
- 🔲 **Still needed (user): upload the mp4 to YouTube** and paste the link
  into the Devpost form (task 34). The write-up marks the video link TODO.

## 5. Devpost write-up — ✅ PASS

- `docs/devpost-writeup.md` (178 lines): tagline, inspiration, what it
  does, how it was built (incl. "How Kiro was used"), challenges,
  accomplishments, what was learned, what's next, links.
- Claims were checked against the code in task 32 and re-spot-checked
  today: Next.js `^16.4.5` + React `^19.3.1` + `rss-parser` (package.json);
  Pollinations.ai keyless, model `openai`; `node:sqlite`; 30-min timer;
  ranking formula + 3/feed cap; 69 tests; video 160.3 s / 18.8 MB.
- Honest where it matters: Vultr fallback deploy, slideshow video with
  synthetic TTS, ~1/3 summarizer 404 rate with the designed fallback.
- Nothing has been submitted to Devpost — that is task 34.

## 6. Requirements coverage (requirements.md) — ✅ PASS with 2 honest partials

| Req | Verdict | Evidence |
|---|---|---|
| 1 — Feed management (add/remove, invalid rejected, OPML, duplicate) | ✅ | Tasks 13–15 verified live; re-verified in the task 30 live pass (dup 409 / garbage 400 / example.com 422). |
| 2 — Reader list + article view, read/star persist, filters | ✅ | Tasks 17–19 verified live; task 30 re-check (PATCH 200, starred filter 1 → 0 after restore, unknown id 404). |
| 3 — AI summaries (2–3 sentences + why-it-matters, cached, fallback, steering rules) | ⚠️ partial | Sample checked live today: real 2-sentence summary + why-it-matters line on a digest story. Steering rules enforced by validator (task 22). **Limitation:** 9 of 71 live items are at attempts=4 (exhausted) and show "Summary unavailable" — the free keyless summarizer 404s ~1/3 of calls; the fallback is the designed Req 3 AC4 behavior, but strictly AC1 ("every new story gets a summary") is not met for those 9. |
| 4 — Dedupe (canonical URL + normalized title 72h, multi-source chips, summary kept) | ✅ | Tasks 23–24 (19 unit tests) + task 30 live pass: refresh inserted 0, 1 duplicate caught by canonical-URL dedupe. |
| 5 — Daily digest (top 10 last 24h, recency + diversity cap, count when fewer, open marks read) | ✅ | Task 26 + verified live today: count 9 (24h window thin — Req 5 AC3, count shown), ranks 1–9, per-feed 3/3/3, all within 24h. |
| 6 — Spooky-polished UI (dark theme, responsive, animations, empty state) | ⚠️ partial | Theme variables verified in `globals.css` today (`--bg #0b0f0c`, `--accent #7ee787`, `--text`, `--muted`); fade-in/rise-in classes present; empty state with 3 starters verified in task 28. **Limitation:** responsive layout was verified by CSS audit + SSR only — **no pixel-level mobile screenshot check was possible** (no browser on this VM). |
| 7 — Live deployment (public URL, state survives updates) | ✅ | §3 above; restart persistence verified in task 29. |

Non-goals respected: no accounts/login, no paywalls, no mobile apps, no
podcast support, no full-text extraction beyond feeds.

## 7. Tests + build — ✅ PASS

- `npm test` **69/69 pass** (0 fail), re-run today.
- `npm run build` passes (exit 0; route table: `/`, `/digest`,
  `/api/feeds`, `/api/feeds/[id]`, `/api/feeds/import`, `/api/items`,
  `/api/items/[id]`, `/api/items/[id]/summarize`, `/api/refresh`).
- No app code changed in this task, so no regression risk from task 33.

## 8. No secrets committed — ✅ PASS

- Full-history scan (`git log -p --all`, 23 commits) for API keys, tokens,
  passwords, private keys: **0 matches**.
- No `.env` file in the worktree; `.env` and `.env*.local` are gitignored;
  `data/` (SQLite file) is gitignored; only `.env.example` is tracked —
  its `SUMMARIZER_API_KEY` and `DATABASE_URL` values are **empty**
  (SHA-256 of the DATABASE_URL value = empty-string hash).
- Summarizer is keyless by design (Pollinations.ai, no signup); no
  `Authorization` header anywhere in `src/`.

## 9. Submission-readiness gaps — 🔲 user actions still needed

These are the **only** things standing between now and task 34 (submit):

1. **Upload the demo video to YouTube** (owner's YouTube account):
   file `~/workspace/revenant-reader-video/revenant-reader-demo.mp4`
   (2:40). Then paste the YouTube link into the write-up + Devpost form.
2. **Devpost sign-in + submit** (task 34): paste `docs/devpost-writeup.md`
   into the form, set category **Resurrection**, repo link, live demo link,
   video link. Deadline **5 Dec 2026 05:00 WIB**.
3. **Free 4,000 Kiro credits** (task 11): request on the Devpost Resources
   tab before **2 Dec 2026 03:00 WIB** — needs the owner's Devpost sign-in.
   Not requested yet; the app does not need the credits to run.
4. (Optional) **Vercel deploy** with Neon/Supabase Postgres — needs the
   owner's Vercel sign-in. Not required: the Vultr live demo is functional
   and is what the submission links to.
5. (At submit time) Confirm the GitHub repo **topics** are set on
   github.com (not re-verifiable from this VM — see §2).

## Verdict

**Submission-ready except the user actions in §9.** No ❌ fails. The two
⚠️ partials (9 unsummarized stories; no pixel-level mobile check) are
documented limitations of the free summarizer and of this VM's tooling —
neither blocks submission, and both are disclosed honestly in the
write-up. Nothing in this checklist was marked pass without evidence.
