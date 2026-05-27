"use client";

import React from "react";

interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
}

export const RatingInput = ({ value, onChange }: RatingInputProps) => {
  const ratings = Array.from({ length: 11 }, (_, i) => i);

  const getColorClass = (val: number, isSelected: boolean) => {
    if (!isSelected) {
      return "bg-stone-50 text-stone-500 hover:bg-stone-100 border-stone-200";
    }

    if (val >= 7) {
      return "bg-green-600 text-white border-green-700 hover:bg-green-700";
    }
    if (val >= 4) {
      return "bg-yellow-500 text-white border-yellow-600 hover:bg-yellow-600";
    }
    return "bg-red-600 text-white border-red-700 hover:bg-red-700";
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold text-stone-700">Rating ({value}/10)</label>
      <div className="flex flex-wrap gap-2">
        {ratings.map((val) => {
          const isSelected = value === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onChange(val)}
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border shadow-sm transition-all cursor-pointer ${getColorClass(
                val,
                isSelected
              )}`}
            >
              {val}
            </button>
          );
        })}
      </div>
    </div>
  );
};
