"use client";
import { Overlay, type OverlayProps } from "./Overlay";
/** A shared portal becomes a safe-area-aware bottom sheet below 768px. */
export function BottomSheet(props: Omit<OverlayProps, "kind">) {
  return <Overlay {...props} kind="picker" />;
}
