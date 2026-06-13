export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "/placeholder-food.png";
  
  let resolvedUrl = url;
  
  try {
    const parsed = new URL(url);
    
    // If the URL is hosted on ngrok, proxy it through our Next.js API route to bypass browser warnings
    if (parsed.hostname.endsWith("ngrok-free.dev") || parsed.hostname.endsWith("ngrok.io")) {
      return `/api/media-proxy?url=${encodeURIComponent(url)}`;
    }
    
    // Localhost handling on the client side
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
          parsed.hostname = hostname;
          resolvedUrl = parsed.toString();
        }
      }
    }
  } catch (e) {
    // Fallback if URL is relative or invalid
  }
  
  return resolvedUrl;
}
