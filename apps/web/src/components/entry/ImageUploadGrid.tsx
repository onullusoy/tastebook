"use client";

import React, { useRef, useState } from "react";
import { useUploadMedia } from "../../hooks/use-entries";
import { Spinner } from "../ui/Spinner";
import { useToastStore } from "../../stores/toast-store";

interface ImageUploadGridProps {
  value: string[];
  onChange: (value: string[]) => void;
}

interface ImageUploadItem {
  id?: string;
  url?: string;
  isUploading: boolean;
}

export const ImageUploadGrid = ({ value, onChange }: ImageUploadGridProps) => {
  const [previews, setPreviews] = useState<ImageUploadItem[]>([]);
  const uploadMedia = useUploadMedia();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { addToast } = useToastStore();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (value.length + files.length > 5) {
      addToast("You can upload a maximum of 5 images.", "error");
      return;
    }

    for (const file of files) {
      const tempId = Math.random().toString();
      const localUrl = URL.createObjectURL(file);
      const newItem: ImageUploadItem = { url: localUrl, isUploading: true };

      setPreviews((prev) => [...prev, newItem]);

      try {
        const uploadedMedia = await uploadMedia.mutateAsync(file);
        setPreviews((prev) =>
          prev.map((item) =>
            item.url === localUrl
              ? { id: uploadedMedia.id, url: uploadedMedia.url, isUploading: false }
              : item
          )
        );
        onChange([...value, uploadedMedia.id]);
      } catch (err: any) {
        addToast(err.message || "Failed to upload image", "error");
        setPreviews((prev) => prev.filter((item) => item.url !== localUrl));
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemove = (indexToRemove: number, mediaId?: string) => {
    setPreviews((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    if (mediaId) {
      onChange(value.filter((id) => id !== mediaId));
    }
  };

  const slots = Array.from({ length: 5 });

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold text-stone-700">Photos (Max 5)</label>
      <div className="grid grid-cols-5 gap-3">
        {slots.map((_, index) => {
          const item = previews[index];
          if (item) {
            return (
              <div
                key={index}
                className="relative aspect-square rounded-xl border border-warm-200 overflow-hidden bg-stone-50"
              >
                <img
                  src={item.url}
                  alt={`Upload ${index}`}
                  className="w-full h-full object-cover"
                />
                {item.isUploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Spinner size="sm" />
                  </div>
                )}
                {!item.isUploading && (
                  <button
                    type="button"
                    onClick={() => handleRemove(index, item.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs hover:bg-red-700 transition-colors shadow"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          }

          const isFirstEmpty = index === previews.length;

          return (
            <div
              key={index}
              onClick={() => isFirstEmpty && fileInputRef.current?.click()}
              className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${
                isFirstEmpty
                  ? "border-warm-300 hover:border-primary-500 hover:bg-primary-50/20 cursor-pointer"
                  : "border-warm-200 bg-stone-50/50"
              }`}
            >
              {isFirstEmpty && (
                <>
                  <span className="text-2xl text-stone-400 font-light">+</span>
                  <span className="text-[10px] font-bold text-stone-400 mt-1">Add</span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};
