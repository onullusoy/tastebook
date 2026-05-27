import React from "react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
}

export const Spinner = ({ size = "md" }: SpinnerProps) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className="flex items-center justify-center">
      <div
        className={`animate-spin rounded-full border-2 border-primary-100 border-t-primary-500 ${sizeClasses[size]}`}
      />
    </div>
  );
};
