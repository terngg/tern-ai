import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "xs" | "sm" | "md" | "lg";
  hover?: boolean;
  elev?: boolean;
}

const paddings = {
  none: "",
  xs: "p-3",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export function Card({
  padding = "md",
  hover = false,
  elev = false,
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`bg-surface border border-border-subtle rounded-[12px] ${
        elev
          ? "shadow-[var(--shadow-elev)]"
          : "shadow-[var(--shadow-soft)]"
      } ${
        hover
          ? "hover:border-primary/40 hover:shadow-[var(--shadow-warm)] transition-all cursor-pointer"
          : ""
      } ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className = "",
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 mb-4 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="size-8 rounded-[8px] bg-bg flex items-center justify-center text-text-muted shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {title && (
            <h3 className="text-text-main font-semibold text-sm truncate">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-text-muted truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardSection({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`p-4 rounded-[10px] bg-bg border border-border-subtle ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardRow({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`p-3 -mx-3 px-3 transition-colors border-b border-border-subtle last:border-b-0 hover:bg-surface-2/50 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
