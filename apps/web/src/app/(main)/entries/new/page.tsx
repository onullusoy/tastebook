"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { useCreateEntry } from "../../../../hooks/use-entries";
import { useToastStore } from "../../../../stores/toast-store";
import { ImageUploadGrid } from "../../../../components/entry/ImageUploadGrid";
import { RatingInput } from "../../../../components/entry/RatingInput";
import { LocationAutocomplete } from "../../../../components/entry/LocationAutocomplete";
import { Input } from "../../../../components/ui/Input";
import { Textarea } from "../../../../components/ui/Textarea";
import { Button } from "../../../../components/ui/Button";

const ATMOSPHERE_OPTIONS = [
  "romantic", "local", "luxury", "student-friendly", "family-friendly",
  "casual", "fine-dining", "cozy", "trendy", "outdoor", "rooftop",
  "historic", "live-music", "pet-friendly",
] as const;

interface FoodItemValue {
  name: string;
  notes?: string;
}

interface EntryFormValues {
  restaurant_name: string;
  city: string;
  country: string;
  google_place_id?: string | null;
  session_token?: string | null;
  formatted_address?: string | null;
  food_items: FoodItemValue[];
  atmosphere_tags: string[];
  price_level: number;
  rating: number;
  rating_ambience?: number;
  rating_taste?: number;
  rating_service?: number;
  rating_value?: number;
  notes: string;
  visibility: "public" | "friends" | "private";
  media_ids: string[];
}

export default function NewEntryPage() {
  const router = useRouter();
  const createEntry = useCreateEntry();
  const { addToast } = useToastStore();
  const [showSubRatings, setShowSubRatings] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EntryFormValues>({
    defaultValues: {
      restaurant_name: "",
      city: "",
      country: "",
      google_place_id: null,
      session_token: null,
      formatted_address: null,
      food_items: [{ name: "", notes: "" }],
      atmosphere_tags: [],
      price_level: 3,
      rating: 7,
      notes: "",
      visibility: "public",
      media_ids: [],
    },
  });

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const placeId = params.get("google_place_id");
      const name = params.get("name");
      const city = params.get("city");
      const country = params.get("country");
      const address = params.get("address");

      if (placeId) setValue("google_place_id", placeId);
      if (name) setValue("restaurant_name", name, { shouldValidate: true });
      if (city) setValue("city", city, { shouldValidate: true });
      if (country) setValue("country", country, { shouldValidate: true });
      if (address) setValue("formatted_address", address);
    }
  }, [setValue]);

  const watchCity = watch("city");
  const watchCountry = watch("country");

  const { fields, append, remove } = useFieldArray({
    control,
    name: "food_items",
  });

  const onSubmit = async (data: EntryFormValues) => {
    try {
      const validFoodItems = data.food_items
        ? data.food_items
            .filter(fi => fi && fi.name && fi.name.trim().length > 0)
            .map(fi => ({ name: fi.name.trim(), notes: fi.notes?.trim() || undefined }))
        : [];

      await createEntry.mutateAsync({
        restaurant_name: data.restaurant_name,
        city: data.city,
        country: data.country,
        google_place_id: data.google_place_id || undefined,
        session_token: data.session_token || undefined,
        formatted_address: data.formatted_address || undefined,
        food_items: validFoodItems,
        atmosphere_tags: data.atmosphere_tags as any,
        price_level: Number(data.price_level),
        rating: Number(data.rating),
        rating_ambience: data.rating_ambience ? Number(data.rating_ambience) : undefined,
        rating_taste: data.rating_taste ? Number(data.rating_taste) : undefined,
        rating_service: data.rating_service ? Number(data.rating_service) : undefined,
        rating_value: data.rating_value ? Number(data.rating_value) : undefined,
        notes: data.notes || undefined,
        visibility: data.visibility,
        media_ids: data.media_ids,
      });

      addToast("Review posted successfully!", "success");
      router.push("/feed");
    } catch (err: any) {
      addToast(err.message || "Failed to create entry", "error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 bg-white p-6 md:p-8 rounded-2xl border border-warm-200 shadow-sm">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Post a Review</h1>
        <p className="text-sm text-stone-500 mt-1">Share your dining experience with your network.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Location Section */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-black text-stone-800 uppercase tracking-wide">📍 Location</h2>
          
          <Controller
            name="restaurant_name"
            control={control}
            rules={{ required: "Restaurant name is required" }}
            render={({ field }) => (
              <LocationAutocomplete
                mode="establishment"
                label="Restaurant Name *"
                placeholder="e.g. Osteria Francescana"
                value={field.value}
                onChange={field.onChange}
                onChangeCity={(val) => setValue("city", val, { shouldValidate: true })}
                onChangeCountry={(val) => setValue("country", val, { shouldValidate: true })}
                onChangeGooglePlaceId={(val) => setValue("google_place_id", val)}
                onChangeSessionToken={(val) => setValue("session_token", val)}
                onChangeFormattedAddress={(val) => setValue("formatted_address", val)}
                biasCity={watchCity}
                biasCountry={watchCountry}
                error={errors.restaurant_name?.message}
              />
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="city"
              control={control}
              rules={{ required: "City is required" }}
              render={({ field }) => (
                <LocationAutocomplete
                  mode="city"
                  label="City *"
                  placeholder="e.g. Rome"
                  value={field.value}
                  onChange={field.onChange}
                  onChangeCountry={(val) => setValue("country", val, { shouldValidate: true })}
                  error={errors.city?.message}
                />
              )}
            />
            <Controller
              name="country"
              control={control}
              rules={{ required: "Country is required" }}
              render={({ field }) => (
                <LocationAutocomplete
                  mode="country"
                  label="Country *"
                  placeholder="e.g. Italy"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.country?.message}
                />
              )}
            />
          </div>
        </div>

        {/* Food Items Section */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-black text-stone-800 uppercase tracking-wide">🍽️ What did you eat?</h2>
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <Input
                  placeholder={`Dish ${index + 1} name (optional)`}
                  {...register(`food_items.${index}.name` as const)}
                />
                <Input
                  placeholder="Quick note (optional)"
                  {...register(`food_items.${index}.notes` as const)}
                />
              </div>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-warm-200 mt-0.5 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {fields.length < 20 && (
            <button
              type="button"
              onClick={() => append({ name: "", notes: "" })}
              className="text-sm font-bold text-primary-500 hover:text-primary-600 py-2 px-4 rounded-lg border border-dashed border-primary-200 hover:border-primary-300 transition-colors cursor-pointer"
            >
              + Add another dish
            </button>
          )}
        </div>

        {/* Atmosphere Tags */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-black text-stone-800 uppercase tracking-wide">✨ Atmosphere</h2>
          <Controller
            name="atmosphere_tags"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2 pb-2">
                {ATMOSPHERE_OPTIONS.map((tag) => {
                  const isSelected = field.value.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          field.onChange(field.value.filter((t: string) => t !== tag));
                        } else {
                          field.onChange([...field.value, tag]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer flex-shrink-0 ${
                        isSelected
                          ? "bg-primary-500 border-primary-600 text-white"
                          : "bg-warm-50 border-warm-200 text-stone-600 hover:bg-warm-100"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </div>

        {/* Price Level */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-black text-stone-800 uppercase tracking-wide">💰 Price Level</h2>
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

        {/* Overall Rating */}
        <Controller
          name="rating"
          control={control}
          render={({ field }) => (
            <RatingInput value={field.value} onChange={field.onChange} />
          )}
        />

        {/* Sub-Ratings (collapsible) */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowSubRatings(!showSubRatings)}
            className="text-sm font-bold text-stone-500 hover:text-stone-700 flex items-center gap-1 cursor-pointer"
          >
            {showSubRatings ? "▼" : "▶"} Sub-ratings (optional)
          </button>
          {showSubRatings && (
            <div className="grid grid-cols-2 gap-4 bg-warm-50 p-4 rounded-xl border border-warm-100">
              <Input
                label="Ambience (0-10)"
                type="number"
                min={0}
                max={10}
                placeholder="—"
                {...register("rating_ambience", { valueAsNumber: true })}
              />
              <Input
                label="Taste (0-10)"
                type="number"
                min={0}
                max={10}
                placeholder="—"
                {...register("rating_taste", { valueAsNumber: true })}
              />
              <Input
                label="Service (0-10)"
                type="number"
                min={0}
                max={10}
                placeholder="—"
                {...register("rating_service", { valueAsNumber: true })}
              />
              <Input
                label="Value (0-10)"
                type="number"
                min={0}
                max={10}
                placeholder="—"
                {...register("rating_value", { valueAsNumber: true })}
              />
            </div>
          )}
        </div>

        {/* Media Upload */}
        <Controller
          name="media_ids"
          control={control}
          render={({ field }) => (
            <ImageUploadGrid value={field.value} onChange={field.onChange} />
          )}
        />

        {/* Notes */}
        <Textarea
          label="Review Notes"
          placeholder="Describe the textures, flavors, service, and overall dining experience..."
          rows={4}
          {...register("notes")}
        />

        {/* Visibility */}
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

        {/* Actions */}
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
            Post Review
          </Button>
        </div>
      </form>
    </div>
  );
}
