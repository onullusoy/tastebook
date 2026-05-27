"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginRequest } from "@tastebook/shared/schemas/auth";
import { useLogin } from "../../../hooks/use-auth";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const { mutate: login, isPending } = useLogin();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginRequest) => {
    setErrorMessage(null);
    login(data, {
      onSuccess: () => {
        router.push("/feed");
      },
      onError: (err: any) => {
        if (err.status === 401) {
          setErrorMessage("Invalid email or password");
        } else {
          setErrorMessage(err.message || "An unexpected error occurred");
        }
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-stone-800 text-center">Login</h2>
      {errorMessage && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
          {errorMessage}
        </div>
      )}
      <Input
        label="Email"
        type="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        disabled={isPending}
        {...register("email")}
      />
      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        error={errors.password?.message}
        disabled={isPending}
        {...register("password")}
      />
      <Button type="submit" isLoading={isPending} className="w-full mt-2">
        Sign In
      </Button>
      <div className="text-center text-sm text-stone-500 mt-2">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-primary-500 font-semibold hover:underline">
          Register
        </Link>
      </div>
    </form>
  );
}
