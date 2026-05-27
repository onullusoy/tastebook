"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../stores/auth-store";
import { Spinner } from "../../../components/ui/Spinner";

export default function ProfileRedirectPage() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace(`/profile/${user.id}`);
      } else {
        router.replace("/login");
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex items-center justify-center p-12">
      <Spinner size="lg" />
    </div>
  );
}
