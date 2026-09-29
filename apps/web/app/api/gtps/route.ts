import { localIndex } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  try {
    const index = await localIndex();
    return Response.json(
      { entries: index.entries },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "GTPS API documentation is unavailable." },
      { status: 500 },
    );
  }
}
