import React from "react";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface SurfaceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  hoverable?: boolean;
  interactive?: boolean;
}

export interface SubtlePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const paddingMap: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-4 sm:p-6",
};

export const SurfaceCard = React.forwardRef<HTMLDivElement, SurfaceCardProps>(
  ({ padding = "md", hoverable = false, interactive = false, className = "", children, ...props }, ref) => {
    const isInteractive = hoverable || interactive;
    return (
      <div
        ref={ref}
        className={`bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-xl ${
          isInteractive
            ? "transition-colors duration-150 hover:border-[#16845B]/50"
            : ""
        } ${paddingMap[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SurfaceCard.displayName = "SurfaceCard";

export const SubtlePanel = React.forwardRef<HTMLDivElement, SubtlePanelProps>(
  ({ padding = "md", className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`bg-[#F8FAFC] dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/80 rounded-xl ${paddingMap[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SubtlePanel.displayName = "SubtlePanel";
