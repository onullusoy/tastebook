export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "/placeholder-food.png";
  
  if (typeof window === "undefined") {
    return url;
  }
  
  const hostname = window.location.hostname;
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return url;
  }
  
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.hostname = hostname;
      return parsed.toString();
    }
  } catch (e) {
    // Fallback if URL is relative or invalid
  }
  
  return url;
}
