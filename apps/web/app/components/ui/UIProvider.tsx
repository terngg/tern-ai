"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type Tone = "success" | "error" | "warning" | "info";
interface Notification {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
}
interface DialogOptions {
  title: string;
  description: string;
  action?: string;
  danger?: boolean;
  initialValue?: string;
  label?: string;
}
interface UIContextValue {
  notify: (title: string, tone?: Tone, description?: string) => void;
  askConfirm: (options: DialogOptions) => Promise<boolean>;
  askText: (options: DialogOptions) => Promise<string | null>;
  copyText: (text: string) => Promise<void>;
}
const UIContext = createContext<UIContextValue | null>(null);
export function useUI() {
  const context = useContext(UIContext);
  if (!context) throw new Error("UIProvider is required");
  return context;
}
function Toast({
  notice,
  dismiss,
}: {
  notice: Notification;
  dismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(
      () => dismiss(notice.id),
      notice.tone === "error" ? 9000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [notice.id, notice.tone, dismiss, paused]);
  const Icon = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }[notice.tone];
  return (
    <div
      className={`ui-toast ui-toast-${notice.tone}`}
      role={notice.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{notice.title}</strong>
        {notice.description && <p>{notice.description}</p>}
      </div>
      <button
        className="ui-icon-button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(notice.id)}
      >
        <X size={15} />
      </button>
    </div>
  );
}
export function UIProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notification[]>([]);
  const [dialog, setDialog] = useState<
    (DialogOptions & { kind: "confirm" | "text" }) | null
  >(null);
  const [value, setValue] = useState("");
  const pending = useRef<((value: boolean | string | null) => void) | null>(
    null,
  );
  const nextId = useRef(0);
  const notify = useCallback(
    (title: string, tone: Tone = "info", description?: string) => {
      if (title)
        setNotices((previous) => [
          ...previous.slice(-4),
          {
            id: ++nextId.current,
            title,
            tone,
            ...(description ? { description } : {}),
          },
        ]);
    },
    [],
  );
  const dismiss = useCallback(
    (id: number) =>
      setNotices((previous) => previous.filter((notice) => notice.id !== id)),
    [],
  );
  const ask = useCallback(
    (options: DialogOptions, kind: "confirm" | "text") =>
      new Promise<boolean | string | null>((resolve) => {
        if (pending.current) {
          resolve(null);
          return;
        }
        pending.current = resolve;
        setValue(options.initialValue || "");
        setDialog({ ...options, kind });
      }),
    [],
  );
  const askConfirm = useCallback(
    async (options: DialogOptions) => (await ask(options, "confirm")) === true,
    [ask],
  );
  const askText = useCallback(
    async (options: DialogOptions) => {
      const result = await ask(options, "text");
      return typeof result === "string" ? result : null;
    },
    [ask],
  );
  const settle = (answer: boolean | string | null) => {
    pending.current?.(answer);
    pending.current = null;
    setDialog(null);
  };
  const copyText = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notify("Copied to clipboard", "success");
      } catch {
        notify(
          "Could not copy",
          "error",
          "Clipboard access was denied. Select and copy the text manually.",
        );
      }
    },
    [notify],
  );
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      document.documentElement.style.setProperty(
        "--visual-height",
        `${viewport?.height || innerHeight}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      pending.current?.(null);
    };
  }, []);
  return (
    <UIContext.Provider value={{ notify, askConfirm, askText, copyText }}>
      {children}
      {notices.length > 0 &&
        createPortal(
          <div
            className="ui-toasts"
            data-toast-region=""
            aria-label="Notifications"
          >
            {notices.map((notice) => (
              <Toast key={notice.id} notice={notice} dismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
      <Modal
        isOpen={!!dialog}
        title={dialog?.title}
        onClose={() => settle(null)}
        maxWidth="sm"
      >
        {dialog && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (dialog.kind === "confirm" || value.trim())
                settle(dialog.kind === "text" ? value.trim() : true);
            }}
          >
            <p className="ui-dialog-description">{dialog.description}</p>
            {dialog.kind === "text" && (
              <label className="ui-field">
                {dialog.label || "Name"}
                <input
                  data-autofocus
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  maxLength={80}
                  required
                />
              </label>
            )}
            <div className="ui-dialog-actions">
              <Button
                data-autofocus={dialog.kind === "confirm" || undefined}
                onClick={() => settle(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={dialog.danger ? "danger" : "primary"}
                disabled={dialog.kind === "text" && !value.trim()}
              >
                {dialog.action || "Save"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </UIContext.Provider>
  );
}
