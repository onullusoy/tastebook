"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { useCreateList } from "../../../../hooks/use-lists";
import { useToastStore } from "../../../../stores/toast-store";
import { Input } from "../../../../components/ui/Input";
import { Textarea } from "../../../../components/ui/Textarea";
import { Button } from "../../../../components/ui/Button";

interface ListFormValues {
  title: string;
  description: string;
  visibility: "public" | "friends" | "private";
}

export default function NewListPage() {
  const router = useRouter();
  const createList = useCreateList();
  const { addToast } = useToastStore();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ListFormValues>({
    defaultValues: {
      title: "",
      description: "",
      visibility: "public",
    },
  });

  const onSubmit = async (data: ListFormValues) => {
    try {
      await createList.mutateAsync(data);
      addToast("List created successfully!", "success");
      router.push("/lists");
    } catch (err: any) {
      addToast(err.message || "Failed to create list", "error");
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6 bg-white p-6 md:p-8 rounded-2xl border border-warm-200 shadow-sm">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Create List</h1>
        <p className="text-sm text-stone-500 mt-1">Group together and curate your favorite taste entries.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <Input
          label="Title *"
          placeholder="e.g. My Favorite Pasta Spots"
          {...register("title", { required: "Title is required" })}
          error={errors.title?.message}
        />

        <Textarea
          label="Description"
          placeholder="Optional explanation of the purpose or vibe of this list..."
          rows={3}
          {...register("description")}
        />

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-stone-700">Visibility</label>
          <div className="flex gap-2 bg-warm-100 p-1 rounded-xl">
            {(["public", "friends", "private"] as const).map((vis) => (
              <Controller
                key={vis}
                name="visibility"
                control={control}
                render={({ field }) => (
                  <button
                    type="button"
                    onClick={() => field.onChange(vis)}
                    className={`flex-1 py-2 px-3 rounded-lg text-center font-bold text-xs capitalize transition-all cursor-pointer ${
                      field.value === vis
                        ? "bg-white text-stone-800 shadow-sm"
                        : "text-stone-500 hover:text-stone-800"
                    }`}
                  >
                    {vis}
                  </button>
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-4 pt-4 border-t border-warm-100">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 cursor-pointer"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1 cursor-pointer"
            isLoading={createList.isPending}
          >
            Create List
          </Button>
        </div>
      </form>
    </div>
  );
}
