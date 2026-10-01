"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg" | "full";
  className?: string;
}

const widths = {
  sm: "sm:w-[420px]",
  md: "sm:w-[520px]",
  lg: "sm:w-[640px]",
  full: "w-full",
};

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = "md",
  className = "",
}: DrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "Drawer"}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity cursor-pointer animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`relative z-10 w-full ${widths[width]} h-full bg-surface border-l border-border-subtle shadow-[var(--shadow-elev)] flex flex-col overflow-hidden animate-slide-left ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div className="min-w-0 flex-1">
            {subtitle && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block">
                {subtitle}
              </span>
            )}
            {title && (
              <h2 className="text-base font-semibold text-text-main truncate mt-0.5">
                {title}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close provider"
            className="p-1.5 rounded-lg text-text-muted hover:bg-surface-2 hover:text-text-main transition-colors shrink-0 ml-3"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
