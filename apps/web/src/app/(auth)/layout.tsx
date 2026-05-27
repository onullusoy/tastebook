import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-warm-50">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-warm-200 shadow-sm flex flex-col gap-6">
        <div className="flex flex-col items-center text-center">
          <div className="text-3xl font-extrabold text-primary-500 tracking-tight flex items-center gap-1">
            <span>📙</span>
            <span>Tastebook</span>
          </div>
          <p className="text-stone-500 text-sm mt-1">Your personal taste journal</p>
        </div>
        {children}
      </div>
    </div>
  );
}
