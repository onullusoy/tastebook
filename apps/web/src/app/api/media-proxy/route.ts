import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    const parsedUrl = new URL(url);
    
    // Security check: only allow proxying from ngrok domains and localhost to prevent open proxy vulnerability.
    const isNgrok = parsedUrl.hostname.endsWith("ngrok-free.dev") || parsedUrl.hostname.endsWith("ngrok.io");
    const isLocalhost = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    
    if (!isNgrok && !isLocalhost) {
      return new NextResponse("Forbidden domain", { status: 403 });
    }

    const res = await fetch(url, {
      headers: {
        "ngrok-skip-browser-warning": "any-value",
      },
    });

    if (!res.ok) {
      return new NextResponse(`Failed to fetch remote media: ${res.statusText}`, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    console.error("Media proxy error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
