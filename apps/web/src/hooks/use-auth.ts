import { useMutation } from "@tanstack/react-query";
import { LoginRequest, RegisterRequest } from "@tastebook/shared/schemas/auth";
import { AuthTokensResponse } from "@tastebook/shared/api-types";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";

export function useLogin() {
  const store = useAuthStore();
  return useMutation<AuthTokensResponse, Error, LoginRequest>({
    mutationFn: (data) =>
      api.fetch<AuthTokensResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      store.setAccessToken(data.access_token);
      store.setUser(data.user);
    },
  });
}

export function useRegister() {
  const store = useAuthStore();
  return useMutation<AuthTokensResponse, Error, RegisterRequest>({
    mutationFn: (data) =>
      api.fetch<AuthTokensResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      store.setAccessToken(data.access_token);
      store.setUser(data.user);
    },
  });
}
