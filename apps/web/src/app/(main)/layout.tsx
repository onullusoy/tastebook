"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "../../components/auth/AuthGuard";
import { useAuthStore } from "../../stores/auth-store";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const navItems = [
    { label: "Feed", path: "/feed", icon: "🏠" },
    { label: "New Entry", path: "/entries/new", icon: "＋" },
    { label: "Lists", path: "/lists", icon: "📋" },
    { label: "Profile", path: "/profile", icon: "👤" },
  ];

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col md:flex-row bg-warm-50 text-stone-800">
        <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 bg-white border-r border-warm-200 p-6 gap-8 justify-between">
          <div className="flex flex-col gap-8">
            <div className="text-2xl font-bold text-primary-500 tracking-tight flex items-center gap-1">
              <span>📙</span>
              <span>Tastebook</span>
            </div>
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => {
                const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
                      isActive
                        ? "bg-primary-50 text-primary-500"
                        : "text-stone-600 hover:bg-warm-100 hover:text-stone-800"
                    }`}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          {user && (
            <div className="flex flex-col gap-4 border-t border-warm-200 pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold bg-primary-100 text-primary-700 select-none">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold truncate text-stone-800">
                    {user.display_name || user.username}
                  </span>
                  <span className="text-xs text-stone-500 truncate">
                    @{user.username}
                  </span>
                </div>
              </div>
              <button
                onClick={() => logout()}
                className="w-full text-left text-sm text-red-600 font-semibold px-4 py-2 hover:bg-red-50 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </aside>

        <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
          <header className="md:hidden h-14 bg-white border-b border-warm-200 flex items-center justify-between px-4 sticky top-0 z-10">
            <span className="text-xl font-extrabold text-primary-500 flex items-center gap-1">
              <span>📙</span>
              <span>Tastebook</span>
            </span>
            {user && (
              <button
                onClick={() => logout()}
                className="text-xs text-red-600 font-bold border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50"
              >
                Sign Out
              </button>
            )}
          </header>

          <main className="flex-1 p-4 pb-24 md:p-8 max-w-4xl w-full mx-auto">
            {children}
          </main>

          <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-warm-200 flex items-center justify-around px-2 z-10 shadow-lg">
            {navItems.map((item) => {
              const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
                    isActive ? "text-primary-500" : "text-stone-500"
                  }`}
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-[10px] font-bold mt-0.5">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </AuthGuard>
  );
}
