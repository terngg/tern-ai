import type { Attachment, Conversation, WebMessage } from "./storage.js";
import { redactSecrets } from "./secrets.js";

// Whitelist fields: an import must never introduce credential fields into history.
export function importConversation(
  source: string,
  secrets: string[] = [],
): Conversation {
  if (source.length > 1_000_000) throw new Error("Chat export is too large.");
  const raw = JSON.parse(redactSecrets(source, secrets)) as Record<
    string,
    unknown
  >;
  if (
    !raw ||
    typeof raw.title !== "string" ||
    !Array.isArray(raw.messages) ||
    raw.messages.length > 500
  )
    throw new Error("Invalid Tern chat export.");
  const now = Date.now();
  const messages = raw.messages.map((value: unknown): WebMessage => {
    if (!value || typeof value !== "object")
      throw new Error("Invalid message.");
    const m = value as Record<string, unknown>;
    if (
      !["user", "assistant"].includes(String(m.role)) ||
      typeof m.content !== "string" ||
      m.content.length > 80_000
    )
      throw new Error("Invalid message.");
    const message: WebMessage = {
      id: crypto.randomUUID(),
      role: m.role as WebMessage["role"],
      content: m.content,
      createdAt: now,
    };
    if (m.provider === "gemini" || m.provider === "openrouter")
      message.provider = m.provider;
    if (typeof m.model === "string") message.model = m.model.slice(0, 160);
    if (m.artifact && typeof m.artifact === "object") {
      const a = m.artifact as Record<string, unknown>;
      if (
        typeof a.content !== "string" ||
        a.content.length > 80_000 ||
        typeof a.filename !== "string"
      )
        throw new Error("Invalid Lua artifact.");
      message.artifact = {
        language: "lua",
        content: a.content,
        filename:
          (a.filename.split(/[\\/]/).at(-1) || "script.lua")
            .replace(/[^\w.-]/g, "_")
            .replace(/^\.+/, "")
            .replace(/\.lua$/i, "")
            .slice(0, 70) + ".lua",
      };
    }
    if (Array.isArray(m.attachments)) {
      if (m.attachments.length > 5) throw new Error("Too many attachments.");
      message.attachments = m.attachments.map((a: unknown): Attachment => {
        if (!a || typeof a !== "object") throw new Error("Invalid attachment.");
        const f = a as Record<string, unknown>;
        if (
          typeof f.name !== "string" ||
          typeof f.content !== "string" ||
          !/\.(lua|txt)$/i.test(f.name) ||
          new TextEncoder().encode(f.content).length > 16_384 ||
          f.content.includes("\0")
        )
          throw new Error("Invalid attachment.");
        return {
          name: f.name.split(/[\\/]/).at(-1)!.slice(0, 100),
          content: f.content,
          size: new TextEncoder().encode(f.content).length,
        };
      });
    }
    // Imported validation claims are not trusted; validation runs on new requests.
    return message;
  });
  return {
    id: crypto.randomUUID(),
    title: raw.title.slice(0, 80),
    createdAt: now,
    updatedAt: now,
    messages,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 6000) : "",
  };
}
