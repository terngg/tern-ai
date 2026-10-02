"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const layers: HTMLElement[] = [];
let previousOverflow = "";
const inertBefore = new Map<HTMLElement, boolean>();
const focusable =
  'button:not(:disabled),input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),a[href],[tabindex="0"]';
function syncLayers() {
  if (!layers.length) {
    for (const [element, wasInert] of inertBefore) element.inert = wasInert;
    inertBefore.clear();
    document.body.style.overflow = previousOverflow;
    return;
  }
  const top = layers.at(-1)!;
  for (const child of document.body.children) {
    if (
      !(child instanceof HTMLElement) ||
      child.dataset.toastRegion !== undefined
    )
      continue;
    if (!inertBefore.has(child)) inertBefore.set(child, child.inert);
    child.inert = child !== top && !child.contains(top);
  }
}

/** Shared lifecycle for portals and the responsive navigation drawer. */
export function useOverlay(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  returnFocus?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const previousFocus =
      returnFocus?.current ||
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (!layers.length) previousOverflow = document.body.style.overflow;
    layers.push(element);
    document.body.style.overflow = "hidden";
    syncLayers();
    const frame = requestAnimationFrame(() => {
      const first =
        element.querySelector<HTMLElement>("[data-autofocus]") ||
        element.querySelector<HTMLElement>(focusable) ||
        element;
      first.focus({ preventScroll: true });
    });
    const keydown = (event: KeyboardEvent) => {
      if (layers.at(-1) !== element) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key === "Tab") {
        const items = Array.from(
          element.querySelectorAll<HTMLElement>(focusable),
        ).filter(
          (item) => item.getClientRects().length && item.tabIndex !== -1,
        );
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          event.preventDefault();
          element.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            !element.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !element.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown, true);
      const index = layers.indexOf(element);
      if (index !== -1) layers.splice(index, 1);
      syncLayers();
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]"))
        previousFocus.focus({ preventScroll: true });
    };
  }, [open, ref, returnFocus]);
}

export interface OverlayProps {
  title: ReactNode;
  label?: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  kind?: "modal" | "drawer" | "picker" | "menu";
  anchor?: RefObject<HTMLElement | null>;
  className?: string;
  width?: string;
  hideHeader?: boolean;
  closeLabel?: string;
}
export function Overlay({
  title,
  label,
  subtitle,
  onClose,
  children,
  kind = "modal",
  anchor,
  className = "",
  width,
  hideHeader,
  closeLabel = "Close dialog",
}: OverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [position, setPosition] = useState<React.CSSProperties>({});
  useOverlay(true, ref, onClose, anchor);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const panelWidth = Math.min(
        kind === "menu" ? 240 : Math.max(box.width, 420),
        innerWidth - 24,
      );
      const below = innerHeight - box.bottom - 16;
      const above = box.top - 16;
      const upwards = below < 300 && above > below;
      setPosition({
        width: panelWidth,
        left: Math.max(12, Math.min(box.left, innerWidth - panelWidth - 12)),
        ...(upwards
          ? { bottom: innerHeight - box.top + 6 }
          : { top: box.bottom + 6 }),
        maxHeight: Math.min(
          kind === "menu" ? 400 : 540,
          Math.max(180, upwards ? above : below),
        ),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, kind]);
  return createPortal(
    <div
      ref={ref}
      className={`ui-overlay ui-overlay-${kind}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-labelledby={label ? undefined : titleId}
      tabIndex={-1}
    >
      <div
        className="ui-backdrop"
        aria-hidden="true"
        onPointerDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <section
        className={`ui-overlay-panel ${className}`}
        style={anchor ? position : { maxWidth: width }}
      >
        <div className="ui-sheet-handle" aria-hidden="true" />
        {!hideHeader && (
          <header className="ui-overlay-heading">
            <div>
              {subtitle && <p className="ui-eyebrow">{subtitle}</p>}
              <h2 id={titleId}>{title}</h2>
            </div>
            <button
              type="button"
              className="ui-icon-button"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </header>
        )}
        {hideHeader && (
          <h2 className="sr-only" id={titleId}>
            {title}
          </h2>
        )}
        <div className="ui-overlay-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
