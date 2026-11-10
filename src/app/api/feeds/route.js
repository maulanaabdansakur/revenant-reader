// /api/feeds — list + add feeds. Scaffold stub; real logic in Phase 2 (tasks 13–14).

export async function GET() {
  return Response.json({ feeds: [], note: "Scaffold stub — feed CRUD lands in Phase 2." });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!body?.url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }
  return Response.json(
    { error: "Feed adding is not implemented yet (Phase 2, task 14).", url: body.url },
    { status: 501 },
  );
}
