// /api/digest — daily top-10 ranked stories (last 24h) (Phase 3, task 26,
// Req 5). Replaces the scaffold stub. The computation lives in
// src/lib/digest.js (unit-tested); this route is a thin wrapper that
// returns { stories, count, limit, windowHours } — `count` is the number
// of stories in the digest; the UI states the count whenever it is below
// the limit (Req 5 AC3), and "Top 10" when the digest is full.

import { getDigest } from "@/lib/digest";

export async function GET() {
  return Response.json(getDigest());
}
