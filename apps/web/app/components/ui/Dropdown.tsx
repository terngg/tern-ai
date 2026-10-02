"use client";
import { useRef, type ReactNode, type KeyboardEvent } from "react";
import { useState } from "react";
import { Overlay } from "./Overlay";
export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}
export function Dropdown({
  label,
  icon,
  items,
}: {
  label: string;
  icon: ReactNode;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const keys = (event: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) || [],
    );
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        className="ui-icon-button"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {icon}
      </button>
      {open && (
        <Overlay
          kind="menu"
          title={label}
          onClose={() => setOpen(false)}
          anchor={trigger}
          hideHeader
        >
          <div
            role="menu"
            aria-label={label}
            ref={menu}
            onKeyDown={keys}
            className="ui-menu"
          >
            {items.map((item) => (
              <button
                role="menuitem"
                className={item.danger ? "ui-menu-danger" : ""}
                key={item.label}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </Overlay>
      )}
    </>
  );
}
