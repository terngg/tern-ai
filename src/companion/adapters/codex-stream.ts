import type { LocalModel } from "../types.js";
import { localProviderError } from "./local-error.js";

export interface CodexModel extends LocalModel {
  defaultReasoningEffort?: string;
}
export function parseCodexModels(text: string): CodexModel[] {
  let catalog;
  try {
    catalog = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(catalog?.models)) return [];
  const models = new Map<string, CodexModel>();
  for (const model of catalog.models) {
    if (
      model.visibility !== "list" ||
      typeof model.slug !== "string" ||
      !/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(model.slug)
    )
      continue;
    const name =
      typeof model.display_name === "string" && model.display_name.length <= 200
        ? model.display_name
        : model.slug;
    models.set(model.slug, {
      id: model.slug,
      name,
      ...(Number.isSafeInteger(model.context_window) && model.context_window > 0
        ? { contextWindow: model.context_window }
        : {}),
      ...(["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(
        model.default_reasoning_level,
      )
        ? { defaultReasoningEffort: model.default_reasoning_level }
        : {}),
    });
  }
  return [...models.values()];
}

export interface CodexUsage {
  inputTokens: number;
  outputTokens: number;
}
export async function* codexText(
  source: AsyncIterable<string>,
  onUsage: (usage: CodexUsage) => void = () => {},
): AsyncIterable<string> {
  let buffer = "",
    complete = false,
    answered = false;
  const parse = (line: string): string => {
    if (!line.trim()) return "";
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw localProviderError("invalid argument stream");
    }
    if (event?.type === "turn.failed" || event?.type === "error")
      throw localProviderError(
        typeof event.error?.message === "string"
          ? event.error.message
          : event.message,
      );
    if (event?.type === "turn.completed") {
      complete = true;
      const usage = event.usage;
      if (
        Number.isSafeInteger(usage?.input_tokens) &&
        usage.input_tokens >= 0 &&
        Number.isSafeInteger(usage?.output_tokens) &&
        usage.output_tokens >= 0
      )
        onUsage({
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        });
    }
    const item = event?.item;
    if (
      event?.type === "item.completed" &&
      item?.type === "agent_message" &&
      (!item.phase || item.phase === "final_answer") &&
      typeof item.text === "string"
    ) {
      answered ||= !!item.text.trim();
      return item.text;
    }
    return "";
  };
  for await (const chunk of source) {
    buffer += chunk;
    if (buffer.length > 2_000_000)
      throw localProviderError("invalid argument stream size");
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const text = parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (text) yield text;
    }
  }
  if (buffer.trim()) {
    const text = parse(buffer);
    if (text) yield text;
  }
  if (!complete || !answered)
    throw localProviderError("network stream ended before completion");
}
