"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerFormSchema, RegisterFormRequest } from "@tastebook/shared/schemas/auth";
import { useRegister } from "../../../hooks/use-auth";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Eye, EyeOff } from "lucide-react";

type RegisterFormInput = RegisterFormRequest;

export default function RegisterPage() {
  const router = useRouter();
  const { mutate: registerUser, isPending } = useRegister();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const usernameValue = watch("username") || "";
  const passwordValue = watch("password") || "";
  const confirmPasswordValue = watch("confirmPassword") || "";

  const onSubmit = (data: RegisterFormInput) => {
    setErrorMessage(null);

    const { confirmPassword: _, ...registerData } = data;

    registerUser(registerData, {
      onSuccess: () => {
        setTimeout(() => {
          router.push("/feed");
        }, 0);
      },
      onError: (err: any) => {
        if (err.status === 409) {
          setErrorMessage(err.message || "Email already registered or Username already taken");
        } else {
          setErrorMessage(err.message || "An unexpected error occurred");
        }
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-stone-800 text-center">Register</h2>
      {errorMessage && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
          {errorMessage}
        </div>
      )}
      <div>
        <Input
          label="Username"
          type="text"
          placeholder="johndoe"
          error={errors.username?.message}
          disabled={isPending}
          {...register("username")}
        />
        <p className="text-xs text-stone-400 mt-1 pl-1">
          {usernameValue.length}/30 characters (letters, numbers, underscores only)
        </p>
      </div>
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
        type={showPassword ? "text" : "password"}
        placeholder="••••••••"
        error={errors.password?.message}
        disabled={isPending}
        {...register("password")}
        suffix={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-stone-400 hover:text-stone-650 transition-colors focus:outline-none flex items-center justify-center p-1"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        }
      />
      <Input
        label="Confirm Password"
        type={showConfirmPassword ? "text" : "password"}
        placeholder="••••••••"
        error={
          errors.confirmPassword?.message ||
          (confirmPasswordValue && passwordValue !== confirmPasswordValue
            ? "Passwords do not match"
            : undefined)
        }
        disabled={isPending}
        {...register("confirmPassword")}
        suffix={
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="text-stone-400 hover:text-stone-650 transition-colors focus:outline-none flex items-center justify-center p-1"
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
          >
            {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        }
      />
      <Button type="submit" isLoading={isPending} className="w-full mt-2">
        Create Account
      </Button>
      <div className="text-center text-sm text-stone-500 mt-2">
        Already have an account?{" "}
        <Link href="/login" className="text-primary-500 font-semibold hover:underline">
          Login
        </Link>
      </div>
    </form>
  );
}
