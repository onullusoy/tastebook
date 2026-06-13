export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "/placeholder-food.png";
  
  if (typeof window === "undefined") {
    return url;
  }
  
  const hostname = window.location.hostname;
  let resolvedUrl = url;
  
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
        parsed.hostname = hostname;
        resolvedUrl = parsed.toString();
      }
    }
  } catch (e) {
    // Fallback if URL is relative or invalid
  }
  
  // If the URL is hosted on ngrok, proxy it through Next.js image optimizer to bypass browser warnings
  if (resolvedUrl.includes("ngrok-free.dev") || resolvedUrl.includes("ngrok.io")) {
    return `/_next/image?url=${encodeURIComponent(resolvedUrl)}&w=640&q=75`;
  }
  
  return resolvedUrl;
}
