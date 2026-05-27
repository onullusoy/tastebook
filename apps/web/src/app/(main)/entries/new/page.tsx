"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { useCreateEntry } from "../../../../hooks/use-entries";
import { useToastStore } from "../../../../stores/toast-store";
import { ImageUploadGrid } from "../../../../components/entry/ImageUploadGrid";
import { RatingInput } from "../../../../components/entry/RatingInput";
import { Input } from "../../../../components/ui/Input";
import { Textarea } from "../../../../components/ui/Textarea";
import { Button } from "../../../../components/ui/Button";

interface EntryFormValues {
  dish_name: string;
  restaurant_name: string;
  city: string;
  country: string;
  price_level: number;
  rating: number;
  notes: string;
  visibility: "public" | "friends" | "private";
  media_ids: string[];
}

export default function NewEntryPage() {
  const router = useRouter();
  const createEntry = useCreateEntry();
  const { addToast } = useToastStore();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EntryFormValues>({
    defaultValues: {
      dish_name: "",
      restaurant_name: "",
      city: "",
      country: "",
      price_level: 1,
      rating: 7,
      notes: "",
      visibility: "public",
      media_ids: [],
    },
  });

  const onSubmit = async (data: EntryFormValues) => {
    try {
      await createEntry.mutateAsync({
        dish_name: data.dish_name,
        restaurant_name: data.restaurant_name || undefined,
        city: data.city || undefined,
        country: data.country || undefined,
        price_level: Number(data.price_level),
        rating: Number(data.rating),
        notes: data.notes || undefined,
        visibility: data.visibility,
        media_ids: data.media_ids,
      });

      addToast("Entry created successfully!", "success");
      router.push("/feed");
    } catch (err: any) {
      addToast(err.message || "Failed to create entry", "error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 bg-white p-6 md:p-8 rounded-2xl border border-warm-200 shadow-sm">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Create Entry</h1>
        <p className="text-sm text-stone-500 mt-1">Record a new culinary memory to your tastebook.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <Input
          label="Dish Name *"
          placeholder="e.g. Carbonara, Tonkotsu Ramen"
          {...register("dish_name", { required: "Dish name is required" })}
          error={errors.dish_name?.message}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <Input
              label="Restaurant"
              placeholder="e.g. Osteria Francescana"
              {...register("restaurant_name")}
            />
          </div>
          <div>
            <Input label="City" placeholder="e.g. Rome" {...register("city")} />
          </div>
          <div>
            <Input label="Country" placeholder="e.g. Italy" {...register("country")} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-stone-700">Price Level</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <Controller
                key={lvl}
                name="price_level"
                control={control}
                render={({ field }) => (
                  <button
                    type="button"
                    onClick={() => field.onChange(lvl)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-center font-black transition-all cursor-pointer ${
                      field.value === lvl
                        ? "bg-green-600 border-green-700 text-white shadow-sm"
                        : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    {"$".repeat(lvl)}
                  </button>
                )}
              />
            ))}
          </div>
        </div>

        <Controller
          name="rating"
          control={control}
          render={({ field }) => (
            <RatingInput value={field.value} onChange={field.onChange} />
          )}
        />

        <Controller
          name="media_ids"
          control={control}
          render={({ field }) => (
            <ImageUploadGrid value={field.value} onChange={field.onChange} />
          )}
        />

        <Textarea
          label="Notes / Thoughts"
          placeholder="Describe the textures, flavors, service, and context of this dining experience..."
          rows={4}
          {...register("notes")}
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
            isLoading={createEntry.isPending}
          >
            Create Entry
          </Button>
        </div>
      </form>
    </div>
  );
}
