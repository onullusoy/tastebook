"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { useCreateList, useAddToList } from "../../../../hooks/use-lists";
import { useToastStore } from "../../../../stores/toast-store";
import { Input } from "../../../../components/ui/Input";
import { Textarea } from "../../../../components/ui/Textarea";
import { Button } from "../../../../components/ui/Button";
import { LocationAutocomplete } from "../../../../components/entry/LocationAutocomplete";
import { Trash2, Music, ListPlus } from "lucide-react";
import { CoverImageUpload } from "../../../../components/lists/CoverImageUpload";

interface ListFormValues {
  title: string;
  description: string;
  visibility: "public" | "friends" | "private";
  citiesInput?: string;
  cover_image_url?: string | null;
}

interface QueuedRestaurant {
  placeId: string;
  name: string;
  city?: string;
  country?: string;
}

export default function NewListPage() {
  const router = useRouter();
  const createList = useCreateList();
  const addToList = useAddToList();
  const { addToast } = useToastStore();

  const [queuedRestaurants, setQueuedRestaurants] = useState<QueuedRestaurant[]>([]);
  const [searchVal, setSearchVal] = useState("");
  const [searchPlaceId, setSearchPlaceId] = useState<string | null>(null);
  const [searchCity, setSearchCity] = useState("");
  const [searchCountry, setSearchCountry] = useState("");

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
      cover_image_url: null,
    },
  });

  // Auto-add suggestion when selected
  useEffect(() => {
    if (searchPlaceId && searchVal) {
      if (queuedRestaurants.some((r) => r.placeId === searchPlaceId)) {
        addToast("Restaurant already added to queue", "info");
      } else {
        setQueuedRestaurants((prev) => [
          ...prev,
          {
            placeId: searchPlaceId,
            name: searchVal,
            city: searchCity || undefined,
            country: searchCountry || undefined,
          },
        ]);
      }
      // Reset autocomplete fields
      setSearchVal("");
      setSearchPlaceId(null);
      setSearchCity("");
      setSearchCountry("");
    }
  }, [searchPlaceId, searchVal, searchCity, searchCountry, queuedRestaurants, addToast]);

  const handleRemoveQueued = (placeId: string) => {
    setQueuedRestaurants((prev) => prev.filter((r) => r.placeId !== placeId));
  };

  const onSubmit = async (data: ListFormValues) => {
    try {
      // Auto-populate cities from queued restaurants
      const finalCities: string[] = [];
      queuedRestaurants.forEach((r) => {
        if (r.city && !finalCities.some((c) => c.toLowerCase() === r.city!.toLowerCase())) {
          finalCities.push(r.city);
        }
      });

      const list = await createList.mutateAsync({
        title: data.title,
        description: data.description,
        visibility: data.visibility,
        cover_image_url: data.cover_image_url,
        metadata: { cities: finalCities },
      });

      // Seq-add all queued items
      if (queuedRestaurants.length > 0) {
        for (const rest of queuedRestaurants) {
          await addToList.mutateAsync({
            listId: list.id,
            restaurantId: rest.placeId,
            name: rest.name,
            city: rest.city,
            country: rest.country,
          });
        }
      }

      addToast("Restaurant list created successfully!", "success");
      router.push(`/lists/${list.id}`);
    } catch (err: any) {
      addToast(err.message || "Failed to create list", "error");
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6 bg-white p-6 md:p-8 rounded-2xl border border-warm-200 shadow-sm animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
          <ListPlus className="text-primary-500" /> Create Restaurant List
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Curate a collection of restaurants.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <Input
          label="Title *"
          placeholder="e.g. Best Neapolitan Pizza"
          {...register("title", { required: "Title is required" })}
          error={errors.title?.message}
        />

        <Textarea
          label="Description"
          placeholder="What makes this list special? Add notes, guidelines, or details..."
          rows={3}
          {...register("description")}
        />

        <Controller
          name="cover_image_url"
          control={control}
          render={({ field }) => (
            <CoverImageUpload value={field.value} onChange={field.onChange} />
          )}
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
                    className={`flex-1 py-2 px-3 rounded-lg text-center font-bold text-xs capitalize transition-all cursor-pointer ${field.value === vis
                      ? "bg-white text-stone-800 shadow-sm border border-warm-200"
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

        {/* Restaurant Injection search section */}
        <div className="border-t border-warm-100 pt-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-stone-900">Add Restaurants</h3>

          <LocationAutocomplete
            label="Search Restaurant"
            placeholder="Type name to lookup and add..."
            value={searchVal}
            onChange={(val) => setSearchVal(val)}
            onChangeGooglePlaceId={(id) => setSearchPlaceId(id)}
            onChangeCity={(city) => setSearchCity(city)}
            onChangeCountry={(country) => setSearchCountry(country)}
          />

          {/* Queued Restaurants List */}
          {queuedRestaurants.length > 0 && (
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto bg-stone-50 rounded-xl p-3 border border-stone-250/50">
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                Restaurants Queue ({queuedRestaurants.length})
              </span>
              <div className="flex flex-col gap-1.5 mt-1">
                {queuedRestaurants.map((rest, index) => (
                  <div
                    key={rest.placeId}
                    className="flex items-center justify-between bg-white border border-warm-200 rounded-lg p-2.5 shadow-sm text-left animate-slide-in"
                  >
                    <div className="flex flex-col min-w-0 pr-4">
                      <span className="text-xs font-bold text-stone-800 truncate">
                        {index + 1}. {rest.name}
                      </span>
                      {rest.city && (
                        <span className="text-[10px] text-stone-400 mt-0.5">
                          📍 {rest.city}
                          {rest.country ? `, ${rest.country}` : ""}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQueued(rest.placeId)}
                      className="text-stone-400 hover:text-red-500 p-1.5 rounded-full hover:bg-stone-50 transition-all cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            isLoading={createList.isPending || addToList.isPending}
          >
            Create List
          </Button>
        </div>
      </form>
    </div>
  );
}
