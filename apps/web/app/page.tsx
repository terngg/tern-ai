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
import { redactSecrets } from "@/lib/secrets";
import {
  RouterDashboard,
  RouterSelector,
} from "./components/providers/RouterDashboard";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  ArrowUpRight,
  BarChart2,
  Check,
  ChevronDown,
  Code2,
  FileCode,
  FileSearch,
  GitFork,
  Info,
  Layers,
  Menu,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Network,
  Paperclip,
  PieChart,
  Plus,
  Search,
  Server,
  Settings,
  Sun,
  Upload,
  Wrench,
  X,
} from "lucide-react";
type Screen =
  | "chat"
  | "settings"
  | "apis"
  | "providers"
  | "pools"
  | "routing"
  | "usage"
  | "models"
  | "quota"
  | "requests";
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
  const [routerModel, setRouterModel] = useState("auto");
  const [routerPool, setRouterPool] = useState("");
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
        const [storedChats, savedSettings] = await Promise.all([
          chatStorage.all(),
          preferences.get<LocalSettings>("settings"),
        ]);
        setChats(storedChats);
        setSettings({ ...defaultSettings, ...savedSettings });
        // Erase legacy browser credentials. Users explicitly re-enter keys into encrypted server storage.
        await preferences.put("rememberedKeys", {});
        await preferences.put("tern_router_connections_v1", {});
        await preferences.put("tern_router_custom_providers_v1", []);
        if (storedChats[0]) setActiveId(storedChats[0].id);
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
              "models",
              "quota",
              "requests",
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
  const updateChat = useCallback(async (chat: Conversation) => {
    const saved = JSON.parse(
      redactSecrets(JSON.stringify({ ...chat, updatedAt: Date.now() }), []),
    ) as Conversation;
    setChats((prev) =>
      [saved, ...prev.filter((c) => c.id !== saved.id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    );
    await chatStorage.put(saved, []);
  }, []);
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
        name: redactSecrets(file.name, []),
        content: redactSecrets(content, []),
        size: file.size,
      });
      sum += file.size;
    }
    setFiles((prev) => [...prev, ...added].slice(0, 5));
  };
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = redactSecrets(draft.trim(), []);
    if ((!prompt && !files.length) || busy) return;
    let conversation = active;
    if (!conversation) {
      conversation = freshChat();
      setChats((prev) => [conversation!, ...prev]);
      setActiveId(conversation.id);
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
          routerModel,
          poolId: routerPool,
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
              provider: data.provider as string,
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
      redactSecrets(JSON.stringify(chat, null, 2), []),
    );
  const importChat = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Chat export is too large.");
      const imported = importConversation(await file.text(), []);
      await updateChat(imported);
      setActiveId(imported.id);
      setScreen("chat");
      setNotice("Conversation imported locally.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not import chat.");
    }
    event.target.value = "";
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
    setSettings(defaultSettings);
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
        <div className="sidebar-traffic-lights">
          <span className="traffic-dot traffic-red" />
          <span className="traffic-dot traffic-amber" />
          <span className="traffic-dot traffic-green" />
        </div>
        <div className="brand">
          <div className="brand-logo-icon">
            <Network size={18} />
          </div>
          <div className="brand-text">
            <strong>Tern AI</strong>
            <small>v0.3.0 · Router Hub</small>
          </div>
          <button
            className="icon-btn mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>
        <button className="new-chat" onClick={createChat}>
          <Plus size={14} /> New chat
        </button>
        <nav className="side-nav">
          <button
            className={screen === "chat" ? "nav-active" : ""}
            onClick={() => setScreen("chat")}
          >
            <MessageSquare size={16} /> Chats
          </button>
          <button
            className={screen === "providers" ? "nav-active" : ""}
            onClick={() => {
              setScreen("providers");
              setMobileNav(false);
            }}
          >
            <Server size={16} /> Providers
          </button>
          <button
            className={screen === "pools" ? "nav-active" : ""}
            onClick={() => {
              setScreen("pools");
              setMobileNav(false);
            }}
          >
            <Network size={16} /> Proxy Pools
          </button>
          <button
            className={screen === "routing" ? "nav-active" : ""}
            onClick={() => {
              setScreen("routing");
              setMobileNav(false);
            }}
          >
            <GitFork size={16} /> Routing
          </button>
          <button
            className={screen === "usage" ? "nav-active" : ""}
            onClick={() => {
              setScreen("usage");
              setMobileNav(false);
            }}
          >
            <BarChart2 size={16} /> Usage
          </button>
          <button
            className={screen === "models" ? "nav-active" : ""}
            onClick={() => {
              setScreen("models");
              setMobileNav(false);
            }}
          >
            <Layers size={16} /> Models
          </button>
          <button
            className={screen === "quota" ? "nav-active" : ""}
            onClick={() => {
              setScreen("quota");
              setMobileNav(false);
            }}
          >
            <PieChart size={16} /> Quota
          </button>
          <button
            className={screen === "requests" ? "nav-active" : ""}
            onClick={() => {
              setScreen("requests");
              setMobileNav(false);
            }}
          >
            <FileSearch size={16} /> Requests
          </button>
          <button
            className={screen === "apis" ? "nav-active" : ""}
            onClick={() => setScreen("apis")}
          >
            <Code2 size={16} /> GTPS API
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
                      <MoreHorizontal size={14} />
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
            <Settings size={16} /> Settings
          </button>
          <div className="privacy-mini">Chat history stored on this device</div>
          <button
            className="import-chat"
            onClick={() => document.getElementById("import-chat")?.click()}
          >
            <Upload size={14} /> Import conversation
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
              <Menu size={16} />
            </button>
            <button
              className="icon-btn mobile-menu"
              aria-label="Open menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={16} />
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
                        ? "Routing"
                        : screen === "usage"
                          ? "Usage"
                          : screen === "models"
                            ? "Models"
                            : screen === "quota"
                              ? "Quota"
                              : screen === "requests"
                                ? "Requests"
                                : "GTPS API"}
            </span>
            <span className="top-context">
              {screen === "chat" && active?.messages.length
                ? `${active.messages.filter((m) => m.role === "user").length} messages`
                : ""}
            </span>
          </div>
          <div className="top-right">
            <RouterSelector
              model={routerModel}
              pool={routerPool}
              onChange={(model, pool) => {
                setRouterModel(model);
                setRouterPool(pool);
              }}
            />
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
              {settings.theme === "light" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>
        {screen === "settings" ? (
          <div className="page-scroll">
            <RouterDashboard screen="settings" />
            <section className="settings-page">
              <article className="setting-card">
                <h2>Browser data</h2>
                <p>
                  Chats and attachments stay in this browser. Provider
                  credentials live in your encrypted account storage.
                </p>
                <div className="privacy-buttons">
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
                <span className="entry-count">{apiItems.length} entries</span>
              </div>
              <div className="api-search">
                <Search size={14} />
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
                          Ask Tern about this API <ArrowUpRight size={13} />
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
        ) : screen === "providers" ||
          screen === "pools" ||
          screen === "routing" ||
          screen === "usage" ||
          screen === "models" ||
          screen === "quota" ||
          screen === "requests" ? (
          <div className="page-scroll">
            <RouterDashboard screen={screen} />
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
                  {
                    <div className="connect-prompt">
                      <span className="connect-light" />
                      <div>
                        <strong>Connect an AI provider to start</strong>
                        <small>
                          Sign in and add an encrypted provider connection.
                        </small>
                      </div>
                      <button
                        className="secondary-btn"
                        onClick={() => setScreen("settings")}
                      >
                        Open settings <ArrowUpRight size={13} />
                      </button>
                    </div>
                  }
                  <div className="quick-actions">
                    <button onClick={() => action("generate")}>
                      <Code2 size={18} className="text-primary" />
                      <b>Generate script</b>
                      <small>Create a GTPS feature from a prompt</small>
                      <ArrowUpRight size={14} />
                    </button>
                    <button onClick={() => action("fix")}>
                      <Wrench size={18} className="text-amber-400" />
                      <b>Fix Lua</b>
                      <small>Find and repair script issues</small>
                      <ArrowUpRight size={14} />
                    </button>
                    <button onClick={() => action("review")}>
                      <Search size={18} className="text-blue-400" />
                      <b>Review code</b>
                      <small>Check APIs, runtime, and safety</small>
                      <ArrowUpRight size={14} />
                    </button>
                    <button onClick={() => action("explain")}>
                      <FileCode size={18} className="text-green-400" />
                      <b>Explain code</b>
                      <small>Understand an existing Lua script</small>
                      <ArrowUpRight size={14} />
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
                              {message.provider} · {message.model}
                            </span>
                          )}
                        </div>
                        {message.attachments?.map((file) => (
                          <div className="attachment-chip" key={file.name}>
                            <FileCode size={13} className="inline mr-1" /> {file.name}
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
                            <AlertCircle size={14} className="inline mr-1 text-red-400" /> {message.error}
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
                                <Check size={13} className="inline mr-1" /> Lua syntax valid
                              </span>
                            ) : (
                              <span className="validation-fail">
                                <X size={13} className="inline mr-1" /> Lua syntax errors
                              </span>
                            )}
                            <span className="validation-ok">
                              <Check size={13} className="inline mr-1" /> {message.validation.recognized.length} GTPS APIs
                              checked
                            </span>
                            {message.validation.findings.filter(
                              (f) => f.severity === "warning",
                            ).length > 0 && (
                              <span className="validation-warn">
                                <AlertTriangle size={13} className="inline mr-1" />
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
                    <ChevronDown size={14} />
                  </div>
                  <button
                    className="attach-button"
                    title="Attach Lua or text file"
                    onClick={() => inputRef.current?.click()}
                  >
                    <Paperclip size={14} /> <span>Attach</span>
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
                        <FileCode size={13} className="inline mr-1" /> {file.name}
                        <button
                          onClick={() =>
                            setFiles((v) => v.filter((_, n) => n !== i))
                          }
                          aria-label={`Remove ${file.name}`}
                        >
                          <X size={12} />
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
                        Send <ArrowUp size={14} />
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
          <Info size={14} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss notice">
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
