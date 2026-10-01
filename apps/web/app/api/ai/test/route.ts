export async function POST(request: Request): Promise<Response> {
  void request;
  return Response.json(
    { error: "Use authenticated connection testing in /api/router." },
    { status: 410 },
  );
}
