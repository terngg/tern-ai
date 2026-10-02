"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { BottomSheet } from "./BottomSheet";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  group?: string;
  groupStatus?: string;
  keywords?: string;
  disabled?: boolean;
  badges?: string[];
}
export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label: string;
  title?: string;
  name?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  placeholder?: string;
  allowCustom?: boolean;
  className?: string;
}
export function Select({
  options,
  value,
  defaultValue = "",
  onChange,
  label,
  title,
  name,
  disabled,
  searchable = false,
  searchPlaceholder = "Search options…",
  placeholder = "Choose an option",
  allowCustom,
  className = "",
}: SelectProps) {
  const [internal, setInternal] = useState(defaultValue);
  const selectedValue = value ?? internal;
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const typeahead = useRef({ text: "", at: 0 });
  const selected = options.find((option) => option.value === selectedValue);
  const terms = query.toLowerCase().trim().split(/\s+/);
  const filtered = options.filter((option) =>
    terms.every((term) =>
      `${option.label} ${option.description || ""} ${option.value} ${option.group || ""} ${option.keywords || ""}`
        .toLowerCase()
        .includes(term),
    ),
  );
  const visible =
    allowCustom &&
    query.trim() &&
    !options.some((option) => option.value === query.trim())
      ? [
          ...filtered,
          {
            value: query.trim(),
            label: query.trim(),
            description: "Use this model ID",
            group: "Custom model",
          },
        ]
      : filtered;
  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    setInternal(option.value);
    onChange?.(option.value);
    setOpen(false);
  };
  const show = () => {
    setQuery("");
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === selectedValue),
      ),
    );
    setOpen(true);
  };
  useEffect(() => {
    const form = trigger.current?.form;
    const reset = () => setInternal(defaultValue);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const keys = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      let next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? visible.length - 1
            : active + (event.key === "ArrowDown" ? 1 : -1);
      const step = event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
      for (let i = 0; i < visible.length; i++) {
        next = (next + visible.length) % visible.length;
        if (!visible[next]?.disabled) break;
        next += step;
      }
      setActive(Math.max(0, next));
    } else if (event.key === "Enter" || (!searchable && event.key === " ")) {
      event.preventDefault();
      if (visible[active]) choose(visible[active]!);
    } else if (!searchable && event.key.length === 1) {
      const text =
        (Date.now() - typeahead.current.at < 700
          ? typeahead.current.text
          : "") + event.key.toLowerCase();
      typeahead.current = { text, at: Date.now() };
      const next = visible.findIndex(
        (option) =>
          !option.disabled && option.label.toLowerCase().startsWith(text),
      );
      if (next >= 0) setActive(next);
    }
  };
  return (
    <div className={`ui-select ${className}`}>
      {name && (
        <input
          type="hidden"
          name={name}
          value={selectedValue}
          disabled={disabled}
        />
      )}
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        className="ui-select-trigger"
        data-value={selectedValue}
        onClick={show}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span>{selected?.label || selectedValue || placeholder}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <BottomSheet
          title={title || label}
          onClose={() => setOpen(false)}
          anchor={trigger}
          className="ui-picker-panel"
        >
          {searchable && (
            <div className="ui-picker-search">
              <Search size={16} aria-hidden="true" />
              <input
                data-autofocus
                role="combobox"
                aria-label={searchPlaceholder.replace(/…/g, "")}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls={id}
                aria-activedescendant={
                  visible[active] ? `${id}-${active}` : undefined
                }
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={keys}
              />
            </div>
          )}
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={title || label}
            className="ui-option-list"
            tabIndex={searchable ? -1 : 0}
            data-autofocus={!searchable || undefined}
            aria-activedescendant={
              visible[active] ? `${id}-${active}` : undefined
            }
            onKeyDown={searchable ? undefined : keys}
          >
            {!visible.length && (
              <div className="ui-picker-empty">
                No matching options. Try another search.
              </div>
            )}
            {visible.map((option, index) => (
              <div key={option.value}>
                {option.group && option.group !== visible[index - 1]?.group && (
                  <div className="ui-option-group">
                    <span>{option.group}</span>
                    {option.groupStatus && (
                      <span className="ui-group-status">
                        {option.groupStatus}
                      </span>
                    )}
                  </div>
                )}
                <button
                  id={`${id}-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selectedValue === option.value}
                  aria-disabled={option.disabled || undefined}
                  data-index={index}
                  data-value={option.value}
                  className={`ui-option ${index === active ? "ui-option-active" : ""}`}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  <span className="ui-option-check">
                    {selectedValue === option.value && <Check size={15} />}
                  </span>
                  <span className="ui-option-copy">
                    <strong>{option.label}</strong>
                    {option.description && <small>{option.description}</small>}
                    {!!option.badges?.length && (
                      <span className="ui-option-badges">
                        {option.badges.map((badge) => (
                          <span key={badge}>{badge}</span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            ))}
          </div>
          <div className="ui-picker-footer">
            {visible.length} option{visible.length === 1 ? "" : "s"}
            <span>↑ ↓ to navigate · Enter to select</span>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
