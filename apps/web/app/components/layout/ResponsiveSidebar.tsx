"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Overlay } from "../ui/Overlay";
export function ResponsiveSidebar({
  children,
  open,
  onClose,
}: {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!mobile) return children;
  return open ? (
    <Overlay
      kind="drawer"
      title="Navigation"
      onClose={onClose}
      className="ui-navigation"
      width="300px"
      hideHeader
    >
      {children}
    </Overlay>
  ) : null;
}
