import { ApiError } from "./api-error";

class ApiClient {
  private accessToken: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string | null) => void)[] = [];
  public readonly baseUrl = (() => {
    let url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    if (url && !url.endsWith("/api") && !url.endsWith("/api/")) {
      url = `${url.replace(/\/$/, "")}/api`;
    }
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
        try {
          const parsed = new URL(url);
          if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
            parsed.hostname = hostname;
            url = parsed.toString();
          }
        } catch (e) {
          // Fallback if URL is relative or invalid
        }
      }
      console.log("[ApiClient] Client base URL:", url);
    } else {
      console.log("[ApiClient] Server base URL:", url);
    }
    return url;
  })();

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken;
  }

  private subscribeTokenRefresh(cb: (token: string | null) => void) {
    this.refreshSubscribers.push(cb);
  }

  private onRefreshed(token: string | null) {
    this.refreshSubscribers.forEach((cb) => cb(token));
    this.refreshSubscribers = [];
  }

  private sanitizeUrlHost<T>(data: T): T {
    if (typeof window === "undefined" || !data) return data;
    const hostname = window.location.hostname;
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
      return data;
    }
    try {
      const parsedApiUrl = new URL(this.baseUrl);
      const apiHost = parsedApiUrl.host;
      const str = JSON.stringify(data);
      const sanitized = str
        .replace(/https?:\/\/localhost:9000/g, `http://${hostname}:9000`)
        .replace(/https?:\/\/127.0.0.1:9000/g, `http://${hostname}:9000`)
        .replace(/https?:\/\/localhost:3001/g, `${parsedApiUrl.protocol}//${apiHost}`)
        .replace(/https?:\/\/127.0.0.1:3001/g, `${parsedApiUrl.protocol}//${apiHost}`);
      return JSON.parse(sanitized);
    } catch (e) {
      return data;
    }
  }

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    
    const headers = new Headers(options.headers);
    headers.set("Bypass-Tunnel-Reminder", "true");
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }
    
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const config: RequestInit = {
      credentials: "include",
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401 && !path.includes("/auth/refresh") && !path.includes("/auth/login")) {
        try {
          const newToken = await this.refreshToken();
          if (!newToken) {
            throw new ApiError(401, "Unauthorized");
          }
          headers.set("Authorization", `Bearer ${newToken}`);
          const retryResponse = await fetch(url, { ...config, headers });
          if (!retryResponse.ok) {
            const errBody = await retryResponse.json().catch(() => ({}));
            throw new ApiError(retryResponse.status, errBody.message || "Request failed", errBody.errors);
          }
          const resJson = await retryResponse.json();
          return this.sanitizeUrlHost(resJson);
        } catch (refreshError) {
          this.setAccessToken(null);
          if (
            typeof window !== "undefined" &&
            !path.includes("/auth/me") &&
            !window.location.pathname.startsWith("/login") &&
            !window.location.pathname.startsWith("/register")
          ) {
            window.location.href = "/login";
          }
          throw refreshError;
        }
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new ApiError(response.status, errBody.message || "Request failed", errBody.errors);
      }

      if (response.status === 204) {
        return {} as T;
      }

      const resJson = await response.json();
      return this.sanitizeUrlHost(resJson);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, error instanceof Error ? error.message : "Network error");
    }
  }

  public async refreshToken(): Promise<string | null> {
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.subscribeTokenRefresh((token) => {
          resolve(token);
        });
      });
    }

    this.isRefreshing = true;

    try {
      const refreshUrl = `${this.baseUrl}/auth/refresh`;
      const response = await fetch(refreshUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      if (!response.ok) {
        this.onRefreshed(null);
        return null;
      }

      const res = await response.json();
      const token = res.data.access_token;
      if (!token) {
        this.onRefreshed(null);
        return null;
      }

      this.setAccessToken(token);
      this.onRefreshed(token);
      return token;
    } catch (error) {
      this.onRefreshed(null);
      return null;
    } finally {
      this.isRefreshing = false;
    }
  }
}

export const api = new ApiClient();
