"use client";

import React from "react";

interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
}

export const RatingInput = ({ value, onChange }: RatingInputProps) => {
  const getRatingColor = (val: number) => {
    if (val >= 7) return "text-green-700 bg-green-50 border-green-200";
    if (val >= 4) return "text-yellow-700 bg-yellow-50 border-yellow-200";
    return "text-red-700 bg-red-50 border-red-200";
  };

  const getSliderAccent = (val: number) => {
    if (val >= 7) return "accent-green-600";
    if (val >= 4) return "accent-yellow-500";
    return "accent-red-500";
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-stone-50/50 rounded-2xl border border-warm-200/60 shadow-sm">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-stone-700">Overall Rating</label>
        <span className={`px-2.5 py-0.5 text-sm font-black rounded-lg border shadow-sm transition-all ${getRatingColor(value)}`}>
          ★ {value}/10
        </span>
      </div>
      
      <div className="relative mt-2 px-1">
        <input
          type="range"
          min="0"
          max="10"
          step="1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-full h-2.5 bg-stone-200 rounded-lg appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary-100 ${getSliderAccent(value)}`}
        />
        <div className="flex justify-between text-[10px] font-black text-stone-400 mt-2 px-1 select-none">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <span
              key={num}
              onClick={() => onChange(num)}
              className={`cursor-pointer transition-all duration-150 w-4 text-center ${
                num === value
                  ? "text-stone-800 scale-125 font-bold"
                  : "hover:text-stone-600"
              }`}
            >
              {num}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
