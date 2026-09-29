import type { Conversation, WebMessage } from "./storage.js";

const MAX_HISTORY_MESSAGES = 30;
const MAX_HISTORY_CHARS = 80_000;
const MAX_SUMMARY_CHARS = 6_000;
function contentFor(message: WebMessage): string {
  return [
    message.content,
    ...(message.attachments || []).map(
      (file) => `[Attached file: ${file.name}]\n${file.content}`,
    ),
    ...(message.artifact
      ? [
          `[Current Lua artifact: ${message.artifact.filename}]\n\`\`\`lua\n${message.artifact.content}\n\`\`\``,
        ]
      : []),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function contextFor(conversation: Conversation): {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  summary: string;
} {
  // The shared context builder consumes complete turns. Failed/stopped requests do
  // not become conversation context, and code artifacts must survive model switches.
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let user: WebMessage | undefined;
  for (const message of conversation.messages) {
    if (message.role === "user") {
      user = message;
      continue;
    }
    if (user && !message.pending && !message.error) {
      const content = contentFor(message);
      if (content)
        history.push(
          { role: "user", content: contentFor(user) },
          { role: "assistant", content },
        );
    }
    user = undefined;
  }
  let size = history.reduce((n, m) => n + m.content.length, 0);
  while (
    history.length > 2 &&
    (history.length > MAX_HISTORY_MESSAGES || size > MAX_HISTORY_CHARS)
  ) {
    for (const removed of history.splice(0, 2)) size -= removed.content.length;
  }
  // Never truncate the latest code. The core reports a clear context-limit error
  // if that complete turn cannot coexist with authoritative API documentation.
  return { history, summary: conversation.summary.slice(0, MAX_SUMMARY_CHARS) };
}
export function summarizeConversation(messages: WebMessage[]): string {
  const size = messages.reduce((n, m) => n + contentFor(m).length, 0);
  if (messages.length <= 12 && size < 12_000) return "";
  const earlier = messages.slice(0, -4).filter((m) => !m.pending && !m.error);
  const requests = earlier
    .filter((m) => m.role === "user")
    .slice(-12)
    .map((m) => `- ${m.content.slice(0, 300)}`)
    .join("\n");
  const decisions = earlier
    .filter((m) => m.role === "assistant" && m.content)
    .slice(-4)
    .map((m) => m.content.slice(0, 300))
    .join("\n");
  const code =
    [...messages].reverse().find((m) => m.artifact && !m.error)?.artifact
      ?.content || "";
  const names = [
    ...new Set(
      code.match(
        /(?:\bfunction\s+[\w.:]+|\b[\w_]*(?:[Kk]ey|[Ss]torage)[\w_]*|["'][\w:.-]{2,80}["'])/g,
      ) || [],
    ),
  ]
    .slice(0, 70)
    .join(", ");
  return `Earlier requirements:\n${requests}\nEarlier decisions:\n${decisions}\nScript identifiers and storage literals (latest complete code follows in conversation history):\n${names}`.slice(
    0,
    MAX_SUMMARY_CHARS,
  );
}
export function titleFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(
      /^(please|tolong|buatkan|buat|generate|fix|review|explain)\s+/i,
      "",
    )
    .trim();
  if (!cleaned) return "New chat";
  const title =
    cleaned
      .split(/[.!?\n]/)[0]
      ?.slice(0, 48)
      .trim() || cleaned.slice(0, 48);
  return title.charAt(0).toLocaleUpperCase() + title.slice(1);
}
