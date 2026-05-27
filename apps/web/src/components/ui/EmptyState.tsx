import React from "react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-warm-50 border border-warm-200 rounded-2xl max-w-md mx-auto">
      {icon && <div className="text-stone-400 mb-4">{icon}</div>}
      <h3 className="text-lg font-bold text-stone-800 mb-1">{title}</h3>
      <p className="text-sm text-stone-500 mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
