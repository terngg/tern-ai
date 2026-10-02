"use client";
import type { ReactNode } from "react";
import { Overlay } from "./Overlay";
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  className?: string;
}
export function Modal({
  isOpen,
  onClose,
  title = "Dialog",
  children,
  maxWidth = "md",
  className,
}: ModalProps) {
  return isOpen ? (
    <Overlay
      title={title}
      onClose={onClose}
      width={{ sm: "420px", md: "520px", lg: "680px", xl: "880px" }[maxWidth]}
      className={className}
    >
      {children}
    </Overlay>
  ) : null;
}
