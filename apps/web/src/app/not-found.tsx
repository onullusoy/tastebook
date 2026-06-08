import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-warm-50 text-stone-800 p-6">
      <div className="text-center max-w-md">
        <span className="text-8xl block mb-6 animate-bounce">🔍</span>
        <h1 className="text-4xl font-black text-stone-900 tracking-tight mb-3">
          Page Not Found
        </h1>
        <p className="text-stone-600 font-medium mb-8">
          The plate you are looking for doesn't seem to be on the menu. Let's get you back to the main feed!
        </p>
        <Link
          href="/feed"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-xl shadow-md transition-colors"
        >
          Return to Feed
        </Link>
      </div>
    </div>
  );
}
