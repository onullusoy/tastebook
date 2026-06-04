import { create } from "zustand";
import { UserResponse, ApiResponse } from "@tastebook/shared/api-types";
import { api } from "../lib/api-client";

interface AuthState {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: UserResponse | null) => void;
  setAccessToken: (token: string | null) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setAccessToken: (token) => {
    api.setAccessToken(token);
  },
  logout: async () => {
    try {
      await api.fetch("/auth/logout", { method: "POST" });
    } catch {
    } finally {
      api.setAccessToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  },
  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const res = await api.fetch<ApiResponse<UserResponse>>("/auth/me");
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
