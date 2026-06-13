"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { useList, useUpdateList, useAddToList, useRemoveFromList } from "../../../../../hooks/use-lists";
import { useToastStore } from "../../../../../stores/toast-store";
import { Input } from "../../../../../components/ui/Input";
import { Textarea } from "../../../../../components/ui/Textarea";
import { Button } from "../../../../../components/ui/Button";
import { Spinner } from "../../../../../components/ui/Spinner";
import { LocationAutocomplete } from "../../../../../components/entry/LocationAutocomplete";
import { Trash2, ArrowLeft, Save } from "lucide-react";
import { CoverImageUpload } from "../../../../../components/lists/CoverImageUpload";

interface ListFormValues {
  title: string;
  description: string;
  visibility: "public" | "friends" | "private";
  citiesInput?: string;
  cover_image_url?: string | null;
}

export default function EditListPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data: list, isLoading, error } = useList(id);
  const updateList = useUpdateList();
  const addToList = useAddToList();
  const removeFromList = useRemoveFromList();
  const { addToast } = useToastStore();

  const [searchVal, setSearchVal] = useState("");
  const [searchPlaceId, setSearchPlaceId] = useState<string | null>(null);
  const [searchCity, setSearchCity] = useState("");
  const [searchCountry, setSearchCountry] = useState("");

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ListFormValues>({
    defaultValues: {
      title: "",
      description: "",
      visibility: "public",
      cover_image_url: null,
    },
  });

  // Populate values when list is loaded
  useEffect(() => {
    if (list) {
      setValue("title", list.title);
      setValue("description", list.description || "");
      setValue("visibility", list.visibility);
      setValue("cover_image_url", list.cover_image_url || null);
    }
  }, [list, setValue]);

  // Immediately add restaurant to list when selected from autocomplete
  useEffect(() => {
    if (searchPlaceId && searchVal) {
      addToList.mutate(
        {
          listId: id,
          restaurantId: searchPlaceId,
          name: searchVal,
          city: searchCity || undefined,
          country: searchCountry || undefined,
        },
        {
          onSuccess: () => {
            addToast("Restaurant added to list!", "success");
          },
          onError: (err: any) => {
            addToast(err.message || "Failed to add restaurant", "error");
          },
        }
      );
      // Reset autocomplete fields
      setSearchVal("");
      setSearchPlaceId(null);
      setSearchCity("");
      setSearchCountry("");
    }
  }, [searchPlaceId, searchVal, searchCity, searchCountry, id, addToList, addToast]);

  const handleRemoveRestaurant = async (restaurantId: string) => {
    try {
      await removeFromList.mutateAsync({ listId: id, restaurantId });
      addToast("Restaurant removed from list", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to remove restaurant", "error");
    }
  };

  const onSubmit = async (data: ListFormValues) => {
    try {
      await updateList.mutateAsync({
        listId: id,
        body: {
          title: data.title,
          description: data.description,
          visibility: data.visibility,
          cover_image_url: data.cover_image_url,
        },
      });

      addToast("List updated successfully!", "success");
      router.push(`/lists/${id}`);
    } catch (err: any) {
      addToast(err.message || "Failed to update list", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="max-w-md mx-auto py-12 text-center flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold text-stone-850">List not found</h2>
        <p className="text-sm text-stone-500 font-semibold">
          The list you are trying to edit does not exist or you don't have editing permissions.
        </p>
        <Button variant="secondary" onClick={() => router.push("/lists")} className="cursor-pointer">
          Back to Lists
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6 bg-white p-6 md:p-8 rounded-2xl border border-warm-200 shadow-sm animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="cursor-pointer">
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Edit Restaurant List</h1>
        <p className="text-sm text-stone-500 mt-1">Modify details, visibility, or manage items.</p>
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
          placeholder="What makes this list special? Add notes, guidelines..."
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

        {/* Manage Restaurants list section */}
        <div className="border-t border-warm-100 pt-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-stone-900">Manage Restaurants</h3>

          <LocationAutocomplete
            label="Search Restaurant to Add Directly"
            placeholder="Type name to lookup..."
            value={searchVal}
            onChange={(val: string) => setSearchVal(val)}
            onChangeGooglePlaceId={(id: string | null) => setSearchPlaceId(id)}
            onChangeCity={(city: string | null) => setSearchCity(city || "")}
            onChangeCountry={(country: string | null) => setSearchCountry(country || "")}
          />

          {/* Current Restaurants */}
          {list.items && list.items.length > 0 ? (
            <div className="flex flex-col gap-2 bg-stone-50 rounded-xl p-3 border border-stone-250/50 max-h-60 overflow-y-auto">
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                Restaurants in List ({list.items.length})
              </span>
              <div className="flex flex-col gap-1.5 mt-1">
                {list.items.map((rest: any, index: number) => (
                  <div
                    key={rest.google_place_id}
                    className="flex items-center justify-between bg-white border border-warm-200 rounded-lg p-2.5 shadow-sm text-left"
                  >
                    <div className="flex flex-col min-w-0 pr-4">
                      <span className="text-xs font-bold text-stone-800 truncate">
                        {index + 1}. {rest.name}
                      </span>
                      <span className="text-[10px] text-stone-400 mt-0.5">
                        📍 {rest.city}, {rest.country}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRestaurant(rest.google_place_id)}
                      className="text-stone-400 hover:text-red-500 p-1.5 rounded-full hover:bg-stone-50 transition-all cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 bg-stone-50 border border-stone-200/50 rounded-xl">
              <p className="text-xs text-stone-400 font-semibold">No restaurants in this list yet.</p>
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
            className="flex-1 cursor-pointer flex items-center justify-center gap-1.5 font-bold"
            isLoading={updateList.isPending || addToList.isPending || removeFromList.isPending}
          >
            <Save size={16} /> Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
