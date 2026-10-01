"use client";
import React, {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  chatStorage,
  defaultSettings,
  preferences,
  type Attachment,
  type Conversation,
  type LocalSettings,
  type WebMessage,
} from "@/lib/storage";
import {
  contextFor,
  summarizeConversation,
  titleFromPrompt,
} from "@/lib/context";
import { importConversation } from "@/lib/import-chat";
import { maskSecret, redactSecrets } from "@/lib/secrets";
import { ProvidersView } from "./components/providers/ProvidersView";
import { ProxyPoolsView } from "./components/providers/ProxyPoolsView";
import { RoutingCombosView } from "./components/providers/RoutingCombosView";
import { UsageLogsView } from "./components/providers/UsageLogsView";

type Provider = "gemini" | "openrouter";
type ApiModel = {
  id: string;
  name: string;
  free?: boolean;
  contextLength?: number;
};
type Screen =
  | "chat"
  | "settings"
  | "apis"
  | "providers"
  | "pools"
  | "routing"
  | "usage";
const KEY_NAMES: Record<Provider, string> = {
  gemini: "Gemini",
  openrouter: "OpenRouter",
};
const KEY_HINT: Record<Provider, string> = {
  gemini: "AIza…",
  openrouter: "sk-or-…",
};
const LIMIT = 16_384;
function uid(): string {
  return crypto.randomUUID();
}
function freshChat(): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    summary: "",
  };
}
function dayGroup(chat: Conversation): string {
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  if (chat.updatedAt >= start) return "Today";
  if (chat.updatedAt >= start - 86_400_000) return "Yesterday";
  if (chat.updatedAt >= start - 7 * 86_400_000) return "Previous 7 days";
  return "Older";
}
function filenameFromPrompt(prompt: string): string {
  const explicit = /[\w-]+\.lua\b/i.exec(prompt)?.[0];
  if (explicit) return explicit.replace(/[^\p{L}\p{N}._-]/gu, "_");
  const words = prompt
    .toLowerCase()
    .replace(/\/[\w-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 &&
        ![
          "buat",
          "buatkan",
          "tolong",
          "bikin",
          "create",
          "generate",
          "script",
          "sistem",
          "untuk",
          "yang",
          "dengan",
          "please",
          "make",
          "add",
          "fix",
          "review",
        ].includes(word),
    )
    .slice(0, 3);
  return `${words.join("_") || "gtps_script"}.lua`;
}
function saveDownload(name: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function Code({
  children,
  language,
  toolbar = true,
}: {
  children: string;
  language?: string;
  toolbar?: boolean;
}) {
  const lua = language === "lua" || !language;
  const lines = children.split("\n");
  return (
    <div className="code-wrap">
      {toolbar && (
        <div className="code-head">
          <span>{lua ? "Lua" : "Code"}</span>
          <button onClick={() => void navigator.clipboard.writeText(children)}>
            Copy
          </button>
          <button onClick={() => saveDownload("gtps_script.lua", children)}>
            Download .lua
          </button>
        </div>
      )}
      <pre className="code">
        <code>
          {lines.map((line, i) => (
            <span className="code-line" key={i}>
              <i>{i + 1}</i>
              <span>{highlight(line, lua)}</span>
              {i < lines.length - 1 ? "\n" : ""}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
function highlight(line: string, lua: boolean): React.ReactNode {
  if (!lua) return line;
  const pattern =
    /(--.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:local|function|end|if|then|else|elseif|for|while|do|return|nil|true|false|and|or|not|repeat|until|break|in)\b|\b\d+(?:\.\d+)?\b)/g;
  const parts = line.split(pattern);
  return parts.map((p, i) =>
    p.startsWith("--") ? (
      <span className="syntax-comment" key={i}>
        {p}
      </span>
    ) : /^['"]/.test(p) ? (
      <span className="syntax-string" key={i}>
        {p}
      </span>
    ) : /^(local|function|end|if|then|else|elseif|for|while|do|return|nil|true|false|and|or|not|repeat|until|break|in)$/.test(
        p,
      ) ? (
      <span className="syntax-keyword" key={i}>
        {p}
      </span>
    ) : /^\d/.test(p) ? (
      <span className="syntax-number" key={i}>
        {p}
      </span>
    ) : (
      p
    ),
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("chat");
  const [chats, setChats] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [settings, setSettings] = useState<LocalSettings>(defaultSettings);
  const [keys, setKeys] = useState<Record<Provider, string>>({
    gemini: "",
    openrouter: "",
  });
  const [keySaved, setKeySaved] = useState<Record<Provider, boolean>>({
    gemini: false,
    openrouter: false,
  });
  const [models, setModels] = useState<Record<Provider, ApiModel[]>>({
    gemini: [],
    openrouter: [],
  });
  const [modelLoading, setModelLoading] = useState<Record<Provider, boolean>>({
    gemini: false,
    openrouter: false,
  });
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [task, setTask] = useState<
    "chat" | "generate" | "fix" | "review" | "explain"
  >("chat");
  const [drag, setDrag] = useState(false);
  const [apiItems, setApiItems] = useState<
    Array<{
      name: string;
      category: string;
      status: string;
      signature: string;
      description: string;
      example: string;
      notes: string;
      categoryNotes: string;
    }>
  >([]);
  const [apiSearch, setApiSearch] = useState("");
  const [selectedApi, setSelectedApi] = useState<string>();
  const [mobileNav, setMobileNav] = useState(false);
  const [ready, setReady] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = chats.find((c) => c.id === activeId);
  const hasProvider = !!keys.gemini || !!keys.openrouter;
  const groups = useMemo(() => {
    const result: Record<string, Conversation[]> = {};
    for (const chat of chats) {
      const group = dayGroup(chat);
      (result[group] ||= []).push(chat);
    }
    return result;
  }, [chats]);

  useEffect(() => {
    void (async () => {
      try {
        const [storedChats, prefs, savedSettings] = await Promise.all([
          chatStorage.all(),
          preferences.get<Record<Provider, string>>("rememberedKeys"),
          preferences.get<LocalSettings>("settings"),
        ]);
        setChats(storedChats);
        setSettings({ ...defaultSettings, ...savedSettings });
        if (savedSettings?.rememberGemini && prefs?.gemini) {
          setKeys((k) => ({ ...k, gemini: prefs.gemini }));
          setKeySaved((k) => ({ ...k, gemini: true }));
        }
        if (savedSettings?.rememberOpenrouter && prefs?.openrouter) {
          setKeys((k) => ({ ...k, openrouter: prefs.openrouter }));
          setKeySaved((k) => ({ ...k, openrouter: true }));
        }
        if (storedChats[0]) setActiveId(storedChats[0].id);
        const cached = await Promise.all(
          (["gemini", "openrouter"] as Provider[]).map(async (provider) => ({
            provider,
            cache: await preferences.get<{ at: number; models: ApiModel[] }>(
              `models:${provider}`,
            ),
          })),
        );
        for (const { provider, cache } of cached)
          if (cache && Date.now() - cache.at < 6 * 60 * 60 * 1000)
            setModels((v) => ({ ...v, [provider]: cache.models }));
      } catch (e) {
        setNotice(
          e instanceof Error ? e.message : "Could not open local chat storage.",
        );
      } finally {
        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          const screenParam = urlParams.get("screen") as Screen;
          if (
            screenParam &&
            [
              "chat",
              "settings",
              "apis",
              "providers",
              "pools",
              "routing",
              "usage",
            ].includes(screenParam)
          ) {
            setScreen(screenParam);
          }
        }
        setReady(true);
      }
    })();
  }, []);
  useEffect(() => {
    if (ready) {
      document.documentElement.dataset.theme = settings.theme;
      void preferences.put("settings", settings);
    }
  }, [settings, ready]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages, busy]);
  useEffect(() => {
    if (screen === "apis" && !apiItems.length)
      void fetch("/api/gtps")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.entries)) setApiItems(d.entries);
          else setNotice(d.error || "Could not load GTPS API documentation.");
        })
        .catch(() => setNotice("Could not load GTPS API documentation."));
  }, [screen, apiItems.length]);
  const updateChat = useCallback(
    async (chat: Conversation) => {
      const saved = JSON.parse(
        redactSecrets(
          JSON.stringify({ ...chat, updatedAt: Date.now() }),
          Object.values(keys),
        ),
      ) as Conversation;
      setChats((prev) =>
        [saved, ...prev.filter((c) => c.id !== saved.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      );
      await chatStorage.put(saved, Object.values(keys));
    },
    [keys],
  );
  const createChat = useCallback(() => {
    const chat = freshChat();
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    setScreen("chat");
    setMobileNav(false);
    void chatStorage.put(chat);
    setTimeout(() => composerRef.current?.focus(), 50);
  }, []);
  const chooseChat = (chat: Conversation) => {
    setActiveId(chat.id);
    setScreen("chat");
    setMobileNav(false);
  };
  const changeProviderMode = (mode: LocalSettings["providerMode"]) => {
    setSettings((s) => {
      const next = { ...s, providerMode: mode };
      void preferences.put("settings", next);
      return next;
    });
  };
  const changeKey = (provider: Provider, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
    setKeySaved((prev) => ({ ...prev, [provider]: false }));
  };
  const rememberKey = async (provider: Provider, remember: boolean) => {
    const enabled =
      provider === "gemini"
        ? { rememberGemini: remember }
        : { rememberOpenrouter: remember };
    setSettings((s) => ({ ...s, ...enabled }));
    const updated = { ...settings, ...enabled };
    await preferences.put("settings", updated);
    const existing: Partial<Record<Provider, string>> =
      (await preferences.get<Record<Provider, string>>("rememberedKeys")) || {};
    if (remember && keys[provider])
      await preferences.put("rememberedKeys", {
        ...existing,
        [provider]: keys[provider],
      });
    else {
      delete existing[provider];
      await preferences.put("rememberedKeys", existing);
    }
    setKeySaved((v) => ({ ...v, [provider]: remember && !!keys[provider] }));
    setNotice(
      remember
        ? "Key remembered in this browser."
        : "Key will be used for this session only.",
    );
  };
  const saveKey = async (provider: Provider) => {
    const key = keys[provider].trim();
    if (key.length < 20) {
      setNotice(`Enter a valid ${KEY_NAMES[provider]} API key.`);
      return;
    }
    setKeys((prev) => ({ ...prev, [provider]: key }));
    if (
      provider === "gemini"
        ? settings.rememberGemini
        : settings.rememberOpenrouter
    ) {
      const saved =
        (await preferences.get<Record<Provider, string>>("rememberedKeys")) ||
        {};
      await preferences.put("rememberedKeys", { ...saved, [provider]: key });
    }
    setKeySaved((v) => ({ ...v, [provider]: true }));
    void loadModels(provider, true, key);
    setNotice(`${KEY_NAMES[provider]} key saved on this device.`);
  };
  const testProvider = async (provider: Provider) => {
    const key = keys[provider].trim();
    if (!key) {
      setNotice(`Add a ${KEY_NAMES[provider]} key first.`);
      return;
    }
    setNotice(`Testing ${KEY_NAMES[provider]} connection…`);
    try {
      const model =
        provider === "gemini" ? settings.geminiModel : settings.openrouterModel;
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key, model }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Connection test failed.");
      setNotice(`${KEY_NAMES[provider]} connection is ready.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Connection test failed.");
    }
  };
  const loadModels = async (
    provider: Provider,
    refresh = false,
    keyOverride?: string,
  ) => {
    const key = (keyOverride ?? keys[provider]).trim();
    if (!key) {
      setNotice(`Add a ${KEY_NAMES[provider]} key to load models.`);
      return;
    }
    setModelLoading((v) => ({ ...v, [provider]: true }));
    try {
      const cache = await preferences.get<{ at: number; models: ApiModel[] }>(
        `models:${provider}`,
      );
      if (!refresh && cache && Date.now() - cache.at < 6 * 60 * 60 * 1000) {
        setModels((v) => ({ ...v, [provider]: cache.models }));
        return;
      }
      const response = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load models.");
      const list = Array.isArray(data.models)
        ? (data.models as ApiModel[])
        : [];
      if (
        provider === "openrouter" &&
        !list.some((m) => m.id === "openrouter/free")
      )
        list.unshift({
          id: "openrouter/free",
          name: "Free Models Router",
          free: true,
        });
      setModels((v) => ({ ...v, [provider]: list }));
      await preferences.put(`models:${provider}`, {
        at: Date.now(),
        models: list,
      });
      if (list.length > 0 && provider === "gemini") {
        if (!list.some((m) => m.id === settings.geminiModel)) {
          const preferred =
            list.find((m) => m.id === "gemini-2.5-flash") ||
            list.find((m) => m.id === "gemini-2.0-flash") ||
            list.find((m) => m.id.includes("flash")) ||
            list[0];
          if (preferred) {
            setSettings((s) => ({ ...s, geminiModel: preferred.id }));
          }
        }
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load models.");
    } finally {
      setModelLoading((v) => ({ ...v, [provider]: false }));
    }
  };
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const added: Attachment[] = [];
    let sum = files.reduce((n, f) => n + f.size, 0);
    for (const file of Array.from(list)) {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (![".lua", ".txt"].includes(ext)) {
        setNotice("Only .lua and .txt files are supported.");
        continue;
      }
      if (file.size > LIMIT || sum + file.size > LIMIT) {
        setNotice(
          "This file is too large. Attachments are limited to 16 KiB total.",
        );
        continue;
      }
      const content = await file.text();
      if (content.includes("\0")) {
        setNotice("Binary files are not supported.");
        continue;
      }
      added.push({
        name: redactSecrets(file.name, Object.values(keys)),
        content: redactSecrets(content, Object.values(keys)),
        size: file.size,
      });
      sum += file.size;
    }
    setFiles((prev) => [...prev, ...added].slice(0, 5));
  };
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = redactSecrets(draft.trim(), Object.values(keys));
    if ((!prompt && !files.length) || busy) return;
    let conversation = active;
    if (!conversation) {
      conversation = freshChat();
      setChats((prev) => [conversation!, ...prev]);
      setActiveId(conversation.id);
    }
    if (!hasProvider) {
      setNotice(
        "Connect Gemini or OpenRouter in Settings before sending a request.",
      );
      setScreen("settings");
      return;
    }
    const original = conversation;
    const user: WebMessage = {
      id: uid(),
      role: "user",
      content: prompt || "Please inspect the attached Lua file.",
      createdAt: Date.now(),
      ...(files.length ? { attachments: files } : {}),
    };
    const assistant: WebMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      pending: true,
    };
    conversation = {
      ...conversation,
      title: conversation.messages.length
        ? conversation.title
        : titleFromPrompt(prompt),
      messages: [...conversation.messages, user, assistant],
    };
    setDraft("");
    setFiles([]);
    setBusy(true);
    setNotice("");
    setProgress("Matching GTPS APIs…");
    const ctx = contextFor(original);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await updateChat(conversation);
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          providerMode: settings.providerMode,
          keys: {
            gemini: keys.gemini.trim(),
            openrouter: keys.openrouter.trim(),
          },
          models: {
            gemini: settings.geminiModel,
            openrouter: settings.openrouterModel,
          },
          openrouterExplicit:
            settings.openrouterModel !== "openrouter/free" &&
            settings.openrouterModel.endsWith(":free")
              ? true
              : settings.openrouterModel !== "openrouter/free",
          task,
          prompt: user.content,
          history: ctx.history,
          summary: ctx.summary,
          files: user.attachments || [],
          filename: filenameFromPrompt(prompt),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Tern could not start the request.");
      }
      if (!response.body)
        throw new Error("Streaming is not available for this response.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      let latest = conversation;
      const updateAssistant = (patch: Partial<WebMessage>) => {
        latest = {
          ...latest!,
          messages: latest!.messages.map((m) =>
            m.id === assistant.id ? { ...m, ...patch } : m,
          ),
        };
        setChats((cs) => cs.map((c) => (c.id === latest!.id ? latest! : c)));
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const raw of events) {
          const dataLine = raw
            .split("\n")
            .find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          if (data.type === "token" && typeof data.text === "string")
            updateAssistant({
              content:
                (latest!.messages.find((m) => m.id === assistant.id)?.content ||
                  "") + data.text,
            });
          else if (data.type === "reset")
            updateAssistant({
              content: "",
              artifact: undefined,
              validation: undefined,
            });
          else if (data.type === "status" && typeof data.message === "string")
            setProgress(String(data.message));
          else if (data.type === "result") {
            completed = true;
            const text = String(data.text || "");
            const code =
              typeof data.code === "string" && data.code
                ? data.code
                : undefined;
            const artifactCode = code;
            const artifact = artifactCode
              ? {
                  filename:
                    typeof data.filename === "string"
                      ? data.filename
                      : filenameFromPrompt(prompt),
                  language: "lua" as const,
                  content: artifactCode,
                }
              : undefined;
            const display = artifact
              ? typeof data.explanation === "string"
                ? data.explanation
                : ""
              : text;
            updateAssistant({
              content: display,
              artifact,
              validation:
                data.validation && typeof data.validation === "object"
                  ? ({
                      ...(data.validation as WebMessage["validation"]),
                      apiCount: Number(data.apiCount) || 0,
                    } as WebMessage["validation"])
                  : undefined,
              provider: data.provider as Provider,
              model: String(data.model || ""),
              pending: false,
            });
          } else if (data.type === "error") {
            throw new Error(String(data.message || "AI request failed."));
          } else if (data.type === "stopped") {
            updateAssistant({ pending: false, error: "Generation stopped." });
          }
        }
      }
      if (!completed)
        throw new Error(
          "The response stream ended before completion. Please retry.",
        );
      latest = { ...latest!, summary: summarizeConversation(latest!.messages) };
      await updateChat(latest);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed.";
      const failed = {
        ...conversation,
        messages: conversation.messages.map((m) =>
          m.id === assistant.id
            ? {
                ...m,
                pending: false,
                content: "",
                error: controller.signal.aborted
                  ? "Generation stopped."
                  : message,
              }
            : m,
        ),
      };
      try {
        await updateChat(failed);
      } catch {
        setNotice(
          "Browser storage is unavailable. Your chat could not be saved.",
        );
      }
      if (!controller.signal.aborted) setNotice(message);
      setProgress("");
    } finally {
      abortRef.current = undefined;
      setBusy(false);
    }
  };
  const stop = () => abortRef.current?.abort();
  const renameChat = async (chat: Conversation) => {
    if (busy) {
      setNotice("Stop generation before renaming a chat.");
      return;
    }
    const name = window.prompt("Rename chat", chat.title);
    if (name?.trim())
      await updateChat({ ...chat, title: name.trim().slice(0, 80) });
  };
  const deleteChat = async (chat: Conversation) => {
    if (busy) {
      setNotice("Stop generation before deleting a chat.");
      return;
    }
    if (!window.confirm(`Delete “${chat.title}” from this device?`)) return;
    await chatStorage.remove(chat.id);
    const next = chats.filter((c) => c.id !== chat.id);
    setChats(next);
    if (activeId === chat.id) setActiveId(next[0]?.id || "");
  };
  const exportChat = (chat: Conversation) =>
    saveDownload(
      `${chat.title.replace(/[^\p{L}\p{N}-]+/gu, "_").slice(0, 40) || "tern-chat"}.json`,
      redactSecrets(JSON.stringify(chat, null, 2), Object.values(keys)),
    );
  const importChat = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Chat export is too large.");
      const imported = importConversation(
        await file.text(),
        Object.values(keys),
      );
      await updateChat(imported);
      setActiveId(imported.id);
      setScreen("chat");
      setNotice("Conversation imported locally.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not import chat.");
    }
    event.target.value = "";
  };
  const forgetKeys = async () => {
    const confirmed = window.confirm(
      "Forget all remembered API keys on this device? This also disconnects them in this browser.",
    );
    if (!confirmed) return;
    const remembered =
      await preferences.get<Record<Provider, string>>("rememberedKeys");
    await preferences.put("rememberedKeys", {});
    setKeys({ gemini: "", openrouter: "" });
    setKeySaved({ gemini: false, openrouter: false });
    setSettings((s) => ({
      ...s,
      rememberGemini: false,
      rememberOpenrouter: false,
    }));
    setNotice(
      `Forgot ${remembered ? Object.keys(remembered).length : 0} remembered key(s).`,
    );
  };
  const clearChats = async () => {
    if (busy) {
      setNotice("Stop generation before deleting chats.");
      return;
    }
    if (!window.confirm("Delete all conversations stored on this device?"))
      return;
    await chatStorage.clear();
    setChats([]);
    setActiveId("");
    setNotice("All conversations deleted from this browser.");
  };
  const clearData = async () => {
    if (busy) {
      setNotice("Stop generation before resetting data.");
      return;
    }
    if (
      !window.confirm(
        "Delete every local chat, setting, cached model list, and remembered API key?",
      )
    )
      return;
    await chatStorage.clear();
    await preferences.clear();
    setChats([]);
    setActiveId("");
    setKeys({ gemini: "", openrouter: "" });
    setSettings(defaultSettings);
    setKeySaved({ gemini: false, openrouter: false });
    setModels({ gemini: [], openrouter: [] });
    setFiles([]);
    setDraft("");
    setTask("chat");
    setScreen("chat");
    setNotice("Tern Web data cleared from this browser.");
  };
  const action = (value: "generate" | "fix" | "review" | "explain") => {
    setTask(value);
    if (value === "fix" || value === "review" || value === "explain")
      inputRef.current?.click();
    composerRef.current?.focus();
  };
  const filteredApis = apiItems
    .filter((item) =>
      `${item.name} ${item.category} ${item.signature} ${item.description}`
        .toLowerCase()
        .includes(apiSearch.toLowerCase()),
    )
    .slice(0, 200);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <main className="app-shell" data-ready={ready}>
      <aside
        className={`sidebar ${mobileNav ? "sidebar-open" : ""} ${!settings.sidebarOpen ? "sidebar-collapsed" : ""}`}
      >
        <div className="brand">
          <span className="tern-mark">t</span>
          <div>
            <strong>Tern AI</strong>
            <small>GTPS Lua Assistant</small>
          </div>
          <button
            className="icon-btn mobile-close"
            onClick={() => setMobileNav(false)}
          >
            ×
          </button>
        </div>
        <button className="new-chat" onClick={createChat}>
          <b>＋</b> New chat{" "}
        </button>
        <nav className="side-nav">
          <button
            className={screen === "chat" ? "nav-active" : ""}
            onClick={() => setScreen("chat")}
          >
            <span>◌</span> Chats
          </button>
          <button
            className={screen === "providers" ? "nav-active" : ""}
            onClick={() => setScreen("providers")}
          >
            <span>⚡</span> Providers
          </button>
          <button
            className={screen === "pools" ? "nav-active" : ""}
            onClick={() => setScreen("pools")}
          >
            <span>⑆</span> Proxy Pools
          </button>
          <button
            className={screen === "routing" ? "nav-active" : ""}
            onClick={() => setScreen("routing")}
          >
            <span>⇄</span> Routing / Combos
          </button>
          <button
            className={screen === "usage" ? "nav-active" : ""}
            onClick={() => setScreen("usage")}
          >
            <span>◷</span> Usage & Logs
          </button>
          <button
            className={screen === "apis" ? "nav-active" : ""}
            onClick={() => setScreen("apis")}
          >
            <span>⌘</span> GTPS API
          </button>
        </nav>
        <div className="history-label">YOUR CHATS</div>
        <div className="chat-list">
          {Object.entries(groups).map(([group, list]) => (
            <section key={group}>
              <div className="group-label">{group}</div>
              {list.map((chat) => (
                <div
                  className={`chat-row ${activeId === chat.id ? "chat-selected" : ""}`}
                  key={chat.id}
                >
                  <button
                    className="chat-title"
                    onClick={() => chooseChat(chat)}
                    title={chat.title}
                  >
                    {chat.title}
                  </button>
                  <div className="chat-actions">
                    <button
                      title="Rename"
                      onClick={() => void renameChat(chat)}
                    >
                      ···
                    </button>
                    <div className="chat-menu">
                      <button onClick={() => exportChat(chat)}>Export</button>
                      <button onClick={() => void renameChat(chat)}>
                        Rename
                      </button>
                      <button onClick={() => void deleteChat(chat)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button
            className={screen === "settings" ? "nav-active" : ""}
            onClick={() => setScreen("settings")}
          >
            <span>⚙</span> Settings
          </button>
          <div className="privacy-mini">
            <span className="local-dot" /> Router Hub: Active • Vercel Edge
          </div>
          <button
            className="import-chat"
            onClick={() => document.getElementById("import-chat")?.click()}
          >
            ↥ Import conversation
          </button>
          <input
            id="import-chat"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void importChat(e)}
          />
        </div>
      </aside>
      {mobileNav && (
        <button
          className="scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <section className="workspace">
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-btn sidebar-toggle"
              aria-label="Toggle sidebar"
              onClick={() =>
                setSettings((s) => ({ ...s, sidebarOpen: !s.sidebarOpen }))
              }
            >
              ☰
            </button>
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobileNav(true)}
            >
              ☰
            </button>
            <span className="top-title">
              {screen === "chat"
                ? active?.title === "New chat"
                  ? "New chat"
                  : active?.title || "New chat"
                : screen === "settings"
                  ? "Settings"
                  : screen === "providers"
                    ? "Providers"
                    : screen === "pools"
                      ? "Proxy Pools"
                      : screen === "routing"
                        ? "Routing / Combos"
                        : screen === "usage"
                          ? "Usage & Logs"
                          : "GTPS API"}
            </span>
            <span className="top-context">
              {screen === "chat" && active?.messages.length
                ? `${active.messages.filter((m) => m.role === "user").length} messages`
                : ""}
            </span>
          </div>
          <div className="top-right">
            <label className="provider-pill">
              <span className="provider-status" />{" "}
              <select
                aria-label="Provider"
                value={settings.providerMode}
                onChange={(e) =>
                  changeProviderMode(
                    e.target.value as LocalSettings["providerMode"],
                  )
                }
              >
                <option value="auto">Auto</option>
                <option value="gemini">Gemini</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <span className="top-model">
              {settings.providerMode === "openrouter"
                ? settings.openrouterModel
                : settings.providerMode === "gemini"
                  ? settings.geminiModel
                  : "Gemini → OpenRouter"}
            </span>
            <button
              className="icon-btn theme-btn"
              title="Toggle theme"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  theme: s.theme === "dark" ? "light" : "dark",
                }))
              }
            >
              {settings.theme === "light" ? "☼" : "◐"}
            </button>
          </div>
        </header>
        {screen === "settings" ? (
          <div className="page-scroll">
            <section className="settings-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">PREFERENCES</span>
                  <h1>Settings</h1>
                  <p>
                    Connect your own AI provider. Tern has no account system or
                    shared API keys.
                  </p>
                </div>
              </div>
              <div className="settings-grid">
                {(["gemini", "openrouter"] as Provider[]).map((provider) => (
                  <article className="setting-card" key={provider}>
                    <div className="setting-card-head">
                      <div className={`provider-logo ${provider}`}>
                        {provider === "gemini" ? "✳" : "◈"}
                      </div>
                      <div>
                        <h2>{KEY_NAMES[provider]}</h2>
                        <p>
                          {provider === "gemini"
                            ? "Google Gemini API"
                            : "OpenRouter API"}
                        </p>
                      </div>
                      <span
                        className={`connection-tag ${keys[provider] ? "connected" : ""}`}
                      >
                        {keys[provider] ? "Configured" : "Not connected"}
                      </span>
                    </div>
                    <label className="field-label" htmlFor={`${provider}-key`}>
                      API key
                    </label>
                    <div className="key-field">
                      <input
                        id={`${provider}-key`}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={
                          keySaved[provider]
                            ? maskSecret(keys[provider])
                            : KEY_HINT[provider]
                        }
                        value={keySaved[provider] ? "" : keys[provider]}
                        onChange={(e) => changeKey(provider, e.target.value)}
                        onFocus={() => {
                          if (keySaved[provider])
                            setKeySaved((s) => ({ ...s, [provider]: false }));
                        }}
                      />
                      <button
                        className="secondary-btn"
                        onClick={() => void saveKey(provider)}
                      >
                        Save key
                      </button>
                    </div>
                    <div className="setting-actions">
                      <button
                        className="text-btn"
                        onClick={() => void testProvider(provider)}
                      >
                        Test connection
                      </button>
                      <button
                        className="text-btn"
                        onClick={() => void loadModels(provider, true)}
                      >
                        {modelLoading[provider] ? "Loading…" : "Refresh models"}
                      </button>
                    </div>
                    <label
                      className="field-label model-label"
                      htmlFor={`${provider}-model`}
                    >
                      Model
                    </label>
                    <div className="model-field">
                      <select
                        id={`${provider}-model`}
                        value={
                          provider === "gemini"
                            ? settings.geminiModel
                            : settings.openrouterModel
                        }
                        onChange={(e) =>
                          setSettings((s) =>
                            provider === "gemini"
                              ? { ...s, geminiModel: e.target.value }
                              : { ...s, openrouterModel: e.target.value },
                          )
                        }
                      >
                        {!models[provider].some(
                          (m) =>
                            m.id ===
                            (provider === "gemini"
                              ? defaultSettings.geminiModel
                              : defaultSettings.openrouterModel),
                        ) && (
                          <option
                            value={
                              provider === "gemini"
                                ? defaultSettings.geminiModel
                                : defaultSettings.openrouterModel
                            }
                          >
                            {provider === "gemini"
                              ? `${defaultSettings.geminiModel} · Flash`
                              : "openrouter/free · Free"}
                          </option>
                        )}
                        {models[provider].map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {provider === "openrouter"
                              ? m.free
                                ? " · Free"
                                : " · Paid"
                              : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="icon-btn refresh-btn"
                        title="Refresh model list"
                        onClick={() => void loadModels(provider, true)}
                      >
                        ↻
                      </button>
                    </div>
                    {provider === "openrouter" &&
                      settings.openrouterModel !== "openrouter/free" &&
                      !settings.openrouterModel.endsWith(":free") && (
                        <div className="paid-warning">
                          Paid model · usage may incur charges from OpenRouter.
                        </div>
                      )}
                    <label className="remember-row">
                      <input
                        type="checkbox"
                        checked={
                          provider === "gemini"
                            ? settings.rememberGemini
                            : settings.rememberOpenrouter
                        }
                        onChange={(e) =>
                          void rememberKey(provider, e.target.checked)
                        }
                      />
                      <span>
                        <strong>Remember API key on this device</strong>
                        <small>
                          Stored locally; apps on this origin can access it. Use
                          a personal device only.
                        </small>
                      </span>
                    </label>
                    <div className="security-note">
                      Your key is sent to this Tern server endpoint only when
                      you make a provider request. It is not added to chat
                      history or stored on Tern servers.
                    </div>
                  </article>
                ))}
              </div>
              <article className="setting-card preference-card">
                <div className="card-title">
                  <div>
                    <span className="eyebrow">CHAT</span>
                    <h2>Provider behavior</h2>
                  </div>
                </div>
                <label className="field-label">Provider mode</label>
                <select
                  className="wide-select"
                  value={settings.providerMode}
                  onChange={(e) =>
                    changeProviderMode(
                      e.target.value as LocalSettings["providerMode"],
                    )
                  }
                >
                  <option value="auto">Auto · Gemini, then OpenRouter</option>
                  <option value="gemini">Gemini only</option>
                  <option value="openrouter">OpenRouter only</option>
                </select>
                <p className="helper-text">
                  Auto fallback uses only providers you connected. OpenRouter
                  fallback defaults to its free router. A paid model is used
                  only after you select it here.
                </p>
                <label className="field-label theme-label">Appearance</label>
                <select
                  className="wide-select"
                  value={settings.theme}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      theme: e.target.value as LocalSettings["theme"],
                    }))
                  }
                >
                  <option value="system">System</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </article>
              <article className="setting-card privacy-card">
                <div className="card-title">
                  <div>
                    <span className="eyebrow">PRIVACY & DATA</span>
                    <h2>Your data stays yours</h2>
                  </div>
                  <span className="local-icon">⌂</span>
                </div>
                <p>
                  Chat history and uploaded files are stored in this browser’s
                  IndexedDB. Tern does not maintain user accounts or a central
                  chat-history database. API keys are sent through this server
                  endpoint to your selected AI provider for each request.
                </p>
                <div className="privacy-buttons">
                  <button
                    className="secondary-btn"
                    onClick={() => void forgetKeys()}
                  >
                    Forget remembered keys
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => void clearChats()}
                  >
                    Delete all chats
                  </button>
                  <button
                    className="danger-btn"
                    onClick={() => void clearData()}
                  >
                    Reset Tern Web data
                  </button>
                  {active && (
                    <button
                      className="secondary-btn"
                      onClick={() => exportChat(active)}
                    >
                      Export current chat
                    </button>
                  )}
                </div>
              </article>
            </section>
          </div>
        ) : screen === "apis" ? (
          <div className="page-scroll">
            <section className="api-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">LOCAL KNOWLEDGE BASE</span>
                  <h1>GTPS API</h1>
                  <p>
                    The documented API reference used by Tern during generation
                    and validation.
                  </p>
                </div>
                <span className="entry-count">
                  {apiItems.length || 485} entries
                </span>
              </div>
              <div className="api-search">
                <span>⌕</span>
                <input
                  placeholder="Search 485 APIs…"
                  value={apiSearch}
                  onChange={(e) => setApiSearch(e.target.value)}
                />
              </div>
              <div className="api-layout">
                <div className="api-results">
                  {filteredApis.map((item, i) => (
                    <button
                      className={`api-result ${selectedApi === item.name + "-" + i ? "api-result-active" : ""}`}
                      key={item.name + "-" + i}
                      onClick={() => setSelectedApi(item.name + "-" + i)}
                    >
                      <span className="api-result-name">{item.name}</span>
                      <span className="api-result-signature">
                        {item.signature}
                      </span>
                      <span className={`api-status status-${item.status}`}>
                        {item.status.replace("_", " ")}
                      </span>
                    </button>
                  ))}
                  {!filteredApis.length && (
                    <div className="empty-hint">
                      No API entries match this search.
                    </div>
                  )}
                </div>
                <div className="api-detail">
                  {(() => {
                    const idx = filteredApis.findIndex(
                      (item, i) => selectedApi === item.name + "-" + i,
                    );
                    const entry = filteredApis[idx < 0 ? 0 : idx];
                    return entry ? (
                      <>
                        <div className="api-detail-kicker">
                          {entry.category}
                          <span className={`api-status status-${entry.status}`}>
                            {entry.status.replace("_", " ")}
                          </span>
                        </div>
                        <h2>{entry.name}</h2>
                        <code className="signature">{entry.signature}</code>
                        <p>{entry.description}</p>
                        {entry.categoryNotes && (
                          <p className="api-notes">{entry.categoryNotes}</p>
                        )}
                        {entry.example && (
                          <Code language="lua" children={entry.example} />
                        )}
                        <button
                          className="primary-btn api-ask"
                          onClick={() => {
                            setScreen("chat");
                            if (!active) createChat();
                            setDraft(
                              `Explain ${entry.name} and show a GTPS Lua example using its documented signature. `,
                            );
                            setTimeout(() => composerRef.current?.focus(), 50);
                          }}
                        >
                          Ask Tern about this API <span>↗</span>
                        </button>
                      </>
                    ) : (
                      <div className="empty-hint">
                        Loading local GTPS documentation…
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>
          </div>
        ) : screen === "providers" ? (
          <div className="page-scroll">
            <ProvidersView
              settings={settings}
              onUpdateSettings={(s) =>
                setSettings((prev) => ({ ...prev, ...s }))
              }
              rememberedKeys={keys}
              onSyncKeys={(provider, key) => {
                setKeys((prev) => ({ ...prev, [provider]: key }));
                setKeySaved((prev) => ({ ...prev, [provider]: true }));
              }}
            />
          </div>
        ) : screen === "pools" ? (
          <div className="page-scroll">
            <ProxyPoolsView />
          </div>
        ) : screen === "routing" ? (
          <div className="page-scroll">
            <RoutingCombosView />
          </div>
        ) : screen === "usage" ? (
          <div className="page-scroll">
            <UsageLogsView />
          </div>
        ) : (
          <>
            <div
              className="chat-scroll"
              onDragEnter={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void addFiles(e.dataTransfer.files);
              }}
            >
              {drag && (
                <div className="drop-overlay">
                  Drop Lua files to add them to this conversation
                </div>
              )}
              {!active?.messages.length ? (
                <div className="welcome">
                  <div className="welcome-mark">
                    <span>t</span>
                    <i />
                  </div>
                  <span className="eyebrow">GTPS LUA CODING ASSISTANT</span>
                  <h1>Build better GTPS scripts.</h1>
                  <p>
                    Generate, fix, review, and understand Lua scripts with
                    Tern’s local GTPS API knowledge base.
                  </p>
                  {!hasProvider && (
                    <div className="connect-prompt">
                      <span className="connect-light" />
                      <div>
                        <strong>Connect an AI provider to start</strong>
                        <small>
                          Use your own Gemini or OpenRouter API key. No account
                          required.
                        </small>
                      </div>
                      <button
                        className="secondary-btn"
                        onClick={() => setScreen("settings")}
                      >
                        Open settings <span>↗</span>
                      </button>
                    </div>
                  )}
                  <div className="quick-actions">
                    <button onClick={() => action("generate")}>
                      <span>✳</span>
                      <b>Generate script</b>
                      <small>Create a GTPS feature from a prompt</small>
                      <i>↗</i>
                    </button>
                    <button onClick={() => action("fix")}>
                      <span>⌁</span>
                      <b>Fix Lua</b>
                      <small>Find and repair script issues</small>
                      <i>↗</i>
                    </button>
                    <button onClick={() => action("review")}>
                      <span>⌕</span>
                      <b>Review code</b>
                      <small>Check APIs, runtime, and safety</small>
                      <i>↗</i>
                    </button>
                    <button onClick={() => action("explain")}>
                      <span>▤</span>
                      <b>Explain code</b>
                      <small>Understand an existing Lua script</small>
                      <i>↗</i>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="message-list">
                  {active.messages.map((message) => (
                    <article
                      className={`message message-${message.role}`}
                      key={message.id}
                    >
                      <div className={`avatar ${message.role}`}>
                        {message.role === "user" ? "Y" : "t"}
                      </div>
                      <div className="message-body">
                        <div className="message-meta">
                          <strong>
                            {message.role === "user" ? "You" : "Tern"}
                          </strong>
                          {message.provider && (
                            <span>
                              {KEY_NAMES[message.provider]} · {message.model}
                            </span>
                          )}
                        </div>
                        {message.attachments?.map((file) => (
                          <div className="attachment-chip" key={file.name}>
                            ▤ {file.name}
                            <small>{(file.size / 1024).toFixed(1)} KB</small>
                          </div>
                        ))}
                        {message.content && (
                          <div className="markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                pre({ children }) {
                                  const child = React.Children.toArray(
                                    children,
                                  )[0] as React.ReactElement<{
                                    children?: React.ReactNode;
                                    className?: string;
                                  }>;
                                  const code = String(
                                    child?.props?.children || "",
                                  ).replace(/\n$/, "");
                                  const lang = /language-(\w+)/.exec(
                                    child?.props?.className || "",
                                  )?.[1];
                                  return (
                                    <Code
                                      language={lang}
                                      children={code}
                                      toolbar={
                                        !message.pending &&
                                        !!message.validation &&
                                        !message.validation.findings.some(
                                          (f) => f.severity === "error",
                                        )
                                      }
                                    />
                                  );
                                },
                                code({ children, className }) {
                                  if (className)
                                    return (
                                      <code className={className}>
                                        {children}
                                      </code>
                                    );
                                  return (
                                    <code className="inline-code">
                                      {children}
                                    </code>
                                  );
                                },
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {message.pending && (
                          <div className="typing">
                            <span />
                            <span />
                            <span />{" "}
                            <small>{progress || "Tern is working"}</small>
                          </div>
                        )}
                        {message.error && (
                          <div className="message-error">
                            <span>⚠</span> {message.error}
                            <button
                              disabled={busy}
                              onClick={() => {
                                const index = active.messages.findIndex(
                                  (m) => m.id === message.id,
                                );
                                const previous = active.messages
                                  .slice(0, index)
                                  .reverse()
                                  .find((m) => m.role === "user");
                                if (previous) {
                                  setDraft(previous.content);
                                  setFiles(previous.attachments || []);
                                  composerRef.current?.focus();
                                }
                              }}
                            >
                              Retry prompt
                            </button>
                            <button
                              onClick={() => {
                                setNotice(message.error || "");
                                setScreen("settings");
                              }}
                            >
                              Open settings
                            </button>
                          </div>
                        )}
                        {message.artifact && (
                          <div className="artifact-card">
                            <div className="artifact-head">
                              <span className="file-icon">{`{}`}</span>
                              <div>
                                <strong>{message.artifact.filename}</strong>
                                <small>
                                  Lua source ·{" "}
                                  {message.artifact.content.split("\n").length}{" "}
                                  lines
                                </small>
                              </div>
                              <span className="artifact-ok">
                                {message.validation?.syntaxValid &&
                                !message.validation.findings.some(
                                  (f) => f.severity === "error",
                                )
                                  ? "✓ Validated"
                                  : "Validation required"}
                              </span>
                              <div className="artifact-actions">
                                <button
                                  onClick={() =>
                                    void navigator.clipboard.writeText(
                                      message.artifact!.content,
                                    )
                                  }
                                >
                                  Copy
                                </button>
                                <button
                                  onClick={() =>
                                    saveDownload(
                                      message.artifact!.filename,
                                      message.artifact!.content,
                                    )
                                  }
                                >
                                  Download .lua
                                </button>
                              </div>
                            </div>
                            <Code
                              language="lua"
                              children={message.artifact.content}
                              toolbar={false}
                            />
                          </div>
                        )}
                        {message.validation && (
                          <div className="validation-row">
                            {message.validation.syntaxValid ? (
                              <span className="validation-ok">
                                ✓ Lua syntax valid
                              </span>
                            ) : (
                              <span className="validation-fail">
                                ✕ Lua syntax errors
                              </span>
                            )}
                            <span className="validation-ok">
                              ✓ {message.validation.recognized.length} GTPS APIs
                              checked
                            </span>
                            {message.validation.findings.filter(
                              (f) => f.severity === "warning",
                            ).length > 0 && (
                              <span className="validation-warn">
                                ⚠{" "}
                                {
                                  message.validation.findings.filter(
                                    (f) => f.severity === "warning",
                                  ).length
                                }{" "}
                                warnings
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                  <div ref={endRef} />
                </div>
              )}
            </div>
            <footer className="composer-area">
              <div className="composer-wrap">
                <div className="composer-tools">
                  <div className="task-select">
                    <span className="task-dot" />
                    <select
                      value={task}
                      onChange={(e) => setTask(e.target.value as typeof task)}
                      aria-label="Task type"
                    >
                      <option value="chat">Ask Tern</option>
                      <option value="generate">Generate</option>
                      <option value="fix">Fix Lua</option>
                      <option value="review">Review</option>
                      <option value="explain">Explain</option>
                    </select>
                    <span>⌄</span>
                  </div>
                  <button
                    className="attach-button"
                    title="Attach Lua or text file"
                    onClick={() => inputRef.current?.click()}
                  >
                    ＋ <span>Attach</span>
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".lua,.txt,text/plain"
                    hidden
                    onChange={(e) => {
                      void addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="composer-spacer" />
                  <span className="local-badge">
                    <i /> Local history
                  </span>
                </div>
                {files.length > 0 && (
                  <div className="pending-files">
                    {files.map((file, i) => (
                      <span className="pending-file" key={file.name + i}>
                        ▤ {file.name}
                        <button
                          onClick={() =>
                            setFiles((v) => v.filter((_, n) => n !== i))
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <form onSubmit={(e) => void send(e)}>
                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={
                      active?.messages.length
                        ? "Ask Tern to continue, change, or explain this GTPS script…"
                        : "Describe a GTPS Lua script or attach a file…"
                    }
                    rows={2}
                  />
                  <div className="composer-bottom">
                    <span>Enter to send · Shift + Enter for a new line</span>
                    {busy ? (
                      <button
                        type="button"
                        className="stop-button"
                        onClick={stop}
                      >
                        <span /> Stop
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="send-button"
                        disabled={!draft.trim() && !files.length}
                      >
                        Send <span>↑</span>
                      </button>
                    )}
                  </div>
                </form>
              </div>
              <div className="composer-footnote">
                Tern retrieves local GTPS API docs and validates generated Lua
                before returning it.
              </div>
            </footer>
          </>
        )}
      </section>
      {notice && (
        <div className="toast" role="status">
          <span>ℹ</span>
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
    </main>
  );
}
