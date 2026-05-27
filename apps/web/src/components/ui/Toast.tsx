"use client";

import React from "react";
import { useToastStore, Toast as ToastType } from "../../stores/toast-store";

export const ToastProvider = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem = ({ toast, onClose }: { toast: ToastType; onClose: () => void }) => {
  const bgColors = {
    success: "bg-green-600 text-white border-green-700",
    error: "bg-red-600 text-white border-red-700",
    info: "bg-stone-800 text-white border-stone-900",
  };

  const icons = {
    success: "✓",
    error: "✗",
    info: "ℹ",
  };

  return (
    <div
      onClick={onClose}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold cursor-pointer animate-fade-in transition-all ${
        bgColors[toast.type]
      }`}
    >
      <span className="text-base flex-shrink-0">{icons[toast.type]}</span>
      <span className="flex-1">{toast.message}</span>
      <button className="text-white opacity-70 hover:opacity-100 text-xs ml-2">✕</button>
    </div>
  );
};
