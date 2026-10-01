// Legacy simulated endpoint retired. Authenticated connection checks live in /api/router.
export async function POST(): Promise<Response> {
  return Response.json(
    { error: "Use authenticated connection testing in /api/router." },
    { status: 410 },
  );
}
