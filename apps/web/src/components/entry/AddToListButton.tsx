"use client";

import React, { useState } from "react";
import { useUserLists, useAddToList } from "../../hooks/use-lists";
import { useToastStore } from "../../stores/toast-store";
import { Spinner } from "../ui/Spinner";

interface AddToListButtonProps {
  entryId: string;
}

export const AddToListButton = ({ entryId }: AddToListButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: lists, isLoading } = useUserLists();
  const addToList = useAddToList();
  const { addToast } = useToastStore();

  const handleAdd = async (listId: string, listTitle: string) => {
    try {
      await addToList.mutateAsync({ listId, entryId });
      addToast(`Added to list "${listTitle}"!`, "success");
      setIsOpen(false);
    } catch (err: any) {
      addToast(err.message || "Failed to add to list", "error");
    }
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-2 text-stone-500 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors flex items-center justify-center border border-warm-200"
        title="Add to list"
      >
        <span className="text-xl">🔖</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div className="absolute right-0 mt-2 w-56 bg-white border border-warm-200 rounded-xl shadow-xl z-20 py-2 animate-fade-in text-left">
            <div className="px-4 py-1 text-xs font-bold text-stone-400 uppercase tracking-wider">
              Add to list
            </div>
            <div className="max-h-48 overflow-y-auto mt-1">
              {isLoading ? (
                <div className="px-4 py-2 flex items-center gap-2 text-sm text-stone-500">
                  <Spinner size="sm" />
                  <span>Loading lists...</span>
                </div>
              ) : !lists || lists.length === 0 ? (
                <div className="px-4 py-2 text-sm text-stone-500">
                  No lists found. Create one in the Lists tab!
                </div>
              ) : (
                lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAdd(list.id, list.title);
                    }}
                    disabled={addToList.isPending}
                    className="w-full px-4 py-2 text-sm text-stone-700 hover:bg-primary-50 hover:text-primary-600 transition-colors text-left flex items-center justify-between"
                  >
                    <span className="truncate">{list.title}</span>
                    <span className="text-xs text-stone-400">({list.item_count})</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
