import { redactSecrets } from "./secrets.js";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MODEL,
} from "../../../src/config/provider-defaults.js";
export type ChatRole = "user" | "assistant";
export interface Attachment {
  name: string;
  content: string;
  size: number;
}
export interface Artifact {
  filename: string;
  language: "lua";
  content: string;
}
export interface WebMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  artifact?: Artifact;
  validation?: {
    syntaxValid: boolean;
    recognized: string[];
    findings: Array<{
      severity: string;
      code: string;
      message: string;
      line: number;
    }>;
    apiCount?: number;
  };
  provider?: "gemini" | "openrouter";
  model?: string;
  pending?: boolean;
  error?: string;
}
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: WebMessage[];
  summary: string;
}
export interface LocalSettings {
  providerMode: "auto" | "gemini" | "openrouter";
  geminiModel: string;
  openrouterModel: string;
  rememberGemini: boolean;
  rememberOpenrouter: boolean;
  theme: "system" | "dark" | "light";
  sidebarOpen: boolean;
}
export const defaultSettings: LocalSettings = {
  providerMode: "auto",
  geminiModel: DEFAULT_GEMINI_MODEL,
  openrouterModel: DEFAULT_MODEL,
  rememberGemini: false,
  rememberOpenrouter: false,
  theme: "system",
  sidebarOpen: true,
};
const DB_NAME = "tern-ai-web";
const DB_VERSION = 1;
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error("Browser storage is unavailable."));
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("chats"))
          db.createObjectStore("chats", { keyPath: "id" });
        if (!db.objectStoreNames.contains("preferences"))
          db.createObjectStore("preferences");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("Could not open browser storage."));
    });
  return database;
}
function operation<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (
    object: IDBObjectStore,
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ) => void,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        tx.onabort = () =>
          reject(tx.error || new Error("Browser storage transaction failed."));
        tx.onerror = () =>
          reject(tx.error || new Error("Browser storage transaction failed."));
        let result: T;
        tx.oncomplete = () => resolve(result);
        run(
          tx.objectStore(store),
          (value) => {
            result = value;
          },
          reject,
        );
      }),
  );
}
export const chatStorage = {
  all: () =>
    operation<Conversation[]>("chats", "readonly", (s, resolve, reject) => {
      const q = s.getAll();
      q.onsuccess = () =>
        resolve(
          (q.result as Conversation[]).sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        );
      q.onerror = () => reject(q.error || new Error("Could not load chats."));
    }),
  get: (id: string) =>
    operation<Conversation | undefined>(
      "chats",
      "readonly",
      (s, resolve, reject) => {
        const q = s.get(id);
        q.onsuccess = () => resolve(q.result as Conversation | undefined);
        q.onerror = () => reject(q.error || new Error("Could not load chat."));
      },
    ),
  put: (chat: Conversation, secrets: string[] = []) =>
    operation<void>("chats", "readwrite", (s, resolve, reject) => {
      const q = s.put(JSON.parse(redactSecrets(JSON.stringify(chat), secrets)));
      q.onsuccess = () => resolve();
      q.onerror = () => reject(q.error || new Error("Could not save chat."));
    }),
  remove: (id: string) =>
    operation<void>("chats", "readwrite", (s, resolve, reject) => {
      const q = s.delete(id);
      q.onsuccess = () => resolve();
      q.onerror = () => reject(q.error || new Error("Could not delete chat."));
    }),
  clear: () =>
    operation<void>("chats", "readwrite", (s, resolve, reject) => {
      const q = s.clear();
      q.onsuccess = () => resolve();
      q.onerror = () => reject(q.error || new Error("Could not clear chats."));
    }),
};
export const preferences = {
  get: <T>(key: string) =>
    operation<T | undefined>(
      "preferences",
      "readonly",
      (s, resolve, reject) => {
        const q = s.get(key);
        q.onsuccess = () => resolve(q.result as T | undefined);
        q.onerror = () =>
          reject(q.error || new Error("Could not load preferences."));
      },
    ),
  put: (key: string, value: unknown) =>
    operation<void>("preferences", "readwrite", (s, resolve, reject) => {
      const q = s.put(value, key);
      q.onsuccess = () => resolve();
      q.onerror = () =>
        reject(q.error || new Error("Could not save preferences."));
    }),
  clear: () =>
    operation<void>("preferences", "readwrite", (s, resolve, reject) => {
      const q = s.clear();
      q.onsuccess = () => resolve();
      q.onerror = () =>
        reject(q.error || new Error("Could not clear preferences."));
    }),
};
