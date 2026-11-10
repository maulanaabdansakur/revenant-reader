# Steering — Summary rules for Revenant Reader

These rules govern every AI summary the app generates. They are enforced in
the summarizer prompt and checked on output. The Kiro agent writing or
reviewing summary code must follow them.

## Length

- **2–3 sentences, no more.** If the story needs more, it is not a summary —
  it is an article. Cut, don't pad.
- **"Why it matters" is exactly one line**, separate from the summary.
- Total summary + why-it-matters must fit on a story card without scrolling.

## Tone

- Neutral, plain, informative. No hype, no slang, no emojis.
- Write for a reader who has 30 seconds, not for a fan of the topic.
- Present tense for ongoing stories; past tense for finished events.
- Never address the reader directly ("you should…", "don't miss…").

## No clickbait

- Never use: "shocking", "you won't believe", "breaking" (unless the source
  itself is a breaking-news wire), "game-changer", "insane", "secret".
- Never tease the conclusion — the summary must contain the actual news.
- Never add a question as a hook ("But what does it mean for you?").
- The headline's claim must match the summary's claim. If the feed title is
  clickbait, the summary corrects it with the facts.

## Accuracy

- Summarize only what the feed item actually says. Never invent facts,
  numbers, quotes, or names that are not in the source.
- If the item is vague ("sources say…"), say so: "details are unconfirmed".
- If the item is an opinion piece, label it: "In an opinion piece, …".
- Do not state a cause ("because X") unless the source states it.

## Formatting

- Plain text only. No markdown, no bullet lists inside a summary.
- One "why it matters" line, prefixed in the UI (not in the stored text)
  with "Why it matters:".
- Language: match the feed item's language (default English).
