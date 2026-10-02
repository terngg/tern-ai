import React from "react";
import { Cable } from "lucide-react";

export function EmptyState({
  icon = <Cable size={28} className="text-text-muted/60" />,
  title,
  description,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title?: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-border-subtle bg-surface/30 my-4 ${className}`}
    >
      <div className="mb-3">{icon}</div>
      {title && (
        <h3 className="text-sm font-semibold text-text-main mb-1">{title}</h3>
      )}
      <p className="text-xs text-text-muted max-w-sm mb-4">{description}</p>
      <div>
        {action || (
          <a
            className="ui-button ui-button-secondary"
            href={
              /request|usage|activity/i.test(title || "")
                ? "/?screen=chat"
                : "/?screen=providers"
            }
          >
            {/request|usage|activity/i.test(title || "")
              ? "Open chat"
              : "Configure providers"}
          </a>
        )}
      </div>
    </div>
  );
}
