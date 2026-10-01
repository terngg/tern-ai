import { chatApi } from "../../../../lib/router/chat-api.js";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request): Promise<Response> {
  return chatApi(request, "openai");
}
