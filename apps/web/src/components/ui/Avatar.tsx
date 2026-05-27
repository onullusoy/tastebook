import React from "react";

interface AvatarProps {
  src?: string | null;
  username: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const Avatar = ({ src, username, size = "md", className = "" }: AvatarProps) => {
  const initials = username.charAt(0).toUpperCase();

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-base",
    lg: "w-24 h-24 text-3xl",
  };

  if (src) {
    return (
      <img
        src={src}
        alt={username}
        className={`rounded-full object-cover border border-warm-200 ${sizeClasses[size]} ${className}`}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold bg-primary-100 text-primary-700 border border-primary-200 select-none ${sizeClasses[size]} ${className}`}
    >
      {initials}
    </div>
  );
};
