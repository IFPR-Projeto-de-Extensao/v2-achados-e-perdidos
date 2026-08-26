import React from "react";

export interface IFLogoProps {
  className?: string;
  alt?: string;
}

/**
 * Official Instituto Federal (IF / IFPR) Logo Component
 * High quality vector rendering with 100% transparent background.
 * Proportions: 216x292 (Aspect ratio ~ 0.74).
 */
export const IFLogo: React.FC<IFLogoProps> = ({
  className = "w-10 h-auto",
  alt = "Instituto Federal do Paraná - IFPR",
}) => {
  return (
    <img
      src="/ifpr-logo.svg"
      alt={alt}
      className={`object-contain select-none bg-transparent ${className}`}
      loading="eager"
      decoding="async"
    />
  );
};
