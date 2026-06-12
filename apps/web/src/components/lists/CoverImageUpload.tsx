"use client";

import React, { useRef } from "react";
import { useUploadMedia } from "../../hooks/use-entries";
import { Spinner } from "../ui/Spinner";
import { useToastStore } from "../../stores/toast-store";
import { resolveMediaUrl } from "../../lib/media-utils";
import { Image as ImageIcon, Upload, X } from "lucide-react";

interface CoverImageUploadProps {
  value?: string | null;
  onChange: (value: string | null) => void;
}

export function CoverImageUpload({ value, onChange }: CoverImageUploadProps) {
  const uploadMedia = useUploadMedia();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { addToast } = useToastStore();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const file = files[0];
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      addToast("Image size must be less than 5MB.", "error");
      return;
    }

    try {
      const uploadedMedia = await uploadMedia.mutateAsync(file);
      onChange(uploadedMedia.url);
      addToast("Cover image uploaded successfully!", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to upload cover image", "error");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(null);
  };

  const isUploading = uploadMedia.isPending;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <label className="text-sm font-bold text-stone-700">Cover Image</label>
        <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">Optional</span>
      </div>

      <p className="text-xs text-stone-500">
        Upload a custom cover image. If not provided, a city view will be selected dynamically.
      </p>

      <div className="relative mt-1">
        {value ? (
          <div className="group relative w-full h-44 rounded-xl border border-warm-200 overflow-hidden bg-neutral-900 shadow-sm transition-all">
            <img
              src={resolveMediaUrl(value)}
              alt="Custom Cover Preview"
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-102"
              onError={(e) => {
                e.currentTarget.src = "/placeholder-food.png";
              }}
            />
            {/* Subtle overlay */}
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />

            {/* Remove cover badge */}
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 hover:bg-red-600 text-white backdrop-blur-md border border-white/10 shadow transition-all cursor-pointer z-10"
              title="Remove Cover Image"
            >
              <X size={16} />
            </button>

            {/* Click to change indicator */}
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
            >
              <div className="bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
                <Upload size={14} /> Change Cover
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all p-4 ${
              isUploading
                ? "border-warm-200 bg-stone-50"
                : "border-warm-350 hover:border-primary-500 hover:bg-stone-50/50 cursor-pointer"
            }`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner size="md" />
                <span className="text-xs text-stone-500 font-semibold animate-pulse">Uploading cover image...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="p-2.5 bg-stone-100/80 rounded-full text-stone-500 mb-2 border border-stone-200/40">
                  <ImageIcon size={20} />
                </div>
                <span className="text-xs font-bold text-stone-700">Click to upload cover image</span>
                <span className="text-[10px] text-stone-400 mt-1 font-semibold">PNG, JPG, or WEBP up to 5MB</span>
              </div>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
      </div>
    </div>
  );
}
