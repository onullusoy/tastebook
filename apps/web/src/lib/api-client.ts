import { ApiError } from "./api-error";

class ApiClient {
  private accessToken: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];
  private baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken;
  }

  private subscribeTokenRefresh(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  private onRefreshed(token: string) {
    this.refreshSubscribers.forEach((cb) => cb(token));
    this.refreshSubscribers = [];
  }

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    
    const headers = new Headers(options.headers);
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }
    
    if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401 && !path.includes("/auth/refresh") && !path.includes("/auth/login")) {
        try {
          const newToken = await this.refreshToken();
          headers.set("Authorization", `Bearer ${newToken}`);
          const retryResponse = await fetch(url, { ...config, headers });
          if (!retryResponse.ok) {
            const errBody = await retryResponse.json().catch(() => ({}));
            throw new ApiError(retryResponse.status, errBody.message || "Request failed", errBody.errors);
          }
          const resJson = await retryResponse.json();
          return resJson.data !== undefined ? resJson.data : resJson;
        } catch (refreshError) {
          this.setAccessToken(null);
          if (typeof window !== "undefined") {
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
      return resJson.data !== undefined ? resJson.data : resJson;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, error instanceof Error ? error.message : "Network error");
    }
  }

  private async refreshToken(): Promise<string> {
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
      });

      if (!response.ok) {
        throw new Error("Failed to refresh token");
      }

      const res = await response.json();
      const token = res.data?.access_token || res.access_token;
      if (!token) {
        throw new Error("No token returned in refresh response");
      }

      this.setAccessToken(token);
      this.onRefreshed(token);
      return token;
    } catch (error) {
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }
}

export const api = new ApiClient();
