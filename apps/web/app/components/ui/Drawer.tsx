"use client";
import type { ReactNode } from "react";
import { Overlay } from "./Overlay";
export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: "sm" | "md" | "lg" | "full";
  className?: string;
}
export function Drawer({
  isOpen,
  onClose,
  title = "Provider details",
  subtitle,
  children,
  width = "md",
  className,
}: DrawerProps) {
  return isOpen ? (
    <Overlay
      kind="drawer"
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      closeLabel="Close provider"
      width={{ sm: "420px", md: "520px", lg: "640px", full: "100%" }[width]}
      className={className}
    >
      {children}
    </Overlay>
  ) : null;
}
