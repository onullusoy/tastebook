import React from "react";

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  altText?: string;
}

export const ImagePreviewModal = ({
  isOpen,
  onClose,
  imageUrl,
  altText = "Entry Image Preview",
}: ImagePreviewModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-stone-950/85 backdrop-blur-md transition-opacity cursor-zoom-out"
        onClick={onClose}
      />

      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/70 hover:text-white font-bold text-2xl py-2 px-4 bg-white/10 hover:bg-white/20 rounded-full transition-all z-20 cursor-pointer"
        aria-label="Close preview"
      >
        ✕
      </button>

      {/* Image Container */}
      <div className="relative max-w-5xl max-h-[90vh] z-10 flex items-center justify-center select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={altText}
          className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/10"
          onError={(e) => {
            e.currentTarget.src = "/placeholder-food.png";
          }}
        />
      </div>
    </div>
  );
};
