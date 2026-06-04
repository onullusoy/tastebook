import React, { useState, useEffect, useRef } from "react";
import { Input } from "../ui/Input";
import { api } from "../../lib/api-client";

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
}

interface LocationAutocompleteProps {
  mode?: "establishment" | "city" | "country";
  value: string;
  onChange: (val: string) => void;
  // Optional callbacks based on the mode
  onChangeCity?: (val: string) => void;
  onChangeCountry?: (val: string) => void;
  onChangeGooglePlaceId?: (val: string | null) => void;
  onChangeSessionToken?: (val: string | null) => void;
  onChangeFormattedAddress?: (val: string | null) => void;
  // Biasing fields
  biasCity?: string;
  biasCountry?: string;
  label: string;
  placeholder?: string;
  error?: string;
}

const generateUUID = () => {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const LocationAutocomplete = ({
  mode = "establishment",
  value,
  onChange,
  onChangeCity,
  onChangeCountry,
  onChangeGooglePlaceId,
  onChangeSessionToken,
  onChangeFormattedAddress,
  biasCity,
  biasCountry,
  label,
  placeholder,
  error,
}: LocationAutocompleteProps) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync internal query state with value prop from parent form
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch suggestions with debounce
  useEffect(() => {
    if (!query.trim() || !isOpen) {
      setSuggestions([]);
      return;
    }

    // Ensure session token exists for this search sequence
    let currentToken = sessionToken;
    if (!currentToken) {
      currentToken = generateUUID();
      setSessionToken(currentToken);
      if (onChangeSessionToken) {
        onChangeSessionToken(currentToken);
      }
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        let inputVal = query;
        if (mode === "establishment") {
          const parts = [query];
          if (biasCity?.trim()) parts.push(biasCity.trim());
          if (biasCountry?.trim()) parts.push(biasCountry.trim());
          inputVal = parts.join(", ");
        }

        const params = new URLSearchParams({
          input: inputVal,
        });
        if (currentToken) {
          params.append("session_token", currentToken);
        }
        if (mode === "city") {
          params.append("types", "(cities)");
        } else if (mode === "country") {
          params.append("types", "country");
        } else {
          params.append("types", "establishment");
        }

        const data = await api.fetch<{ predictions: Prediction[] }>(
          `/places/autocomplete?${params.toString()}`
        );
        if (data && data.predictions) {
          setSuggestions(data.predictions);
        }
      } catch (err) {
        console.error("Failed to fetch autocomplete suggestions", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isOpen, mode, biasCity, biasCountry]);

  const handleSelect = (prediction: Prediction) => {
    const mainText = prediction.structured_formatting.main_text;
    const fullAddress = prediction.description;
    
    // Parse city and country from secondary text as fallback/helper
    const secondaryText = prediction.structured_formatting.secondary_text || "";
    const parts = secondaryText.split(",").map((p) => p.trim());
    
    let parsedCountry = "";
    let parsedCity = "";

    if (parts.length > 0) {
      parsedCountry = parts[parts.length - 1];
    }
    if (parts.length > 1) {
      parsedCity = parts[parts.length - 2];
    }

    // Update parent form fields based on mode
    if (mode === "establishment") {
      onChange(mainText);
      if (onChangeCity) onChangeCity(parsedCity);
      if (onChangeCountry) onChangeCountry(parsedCountry);
      if (onChangeGooglePlaceId) onChangeGooglePlaceId(prediction.place_id);
      if (onChangeFormattedAddress) onChangeFormattedAddress(fullAddress);
    } else if (mode === "city") {
      onChange(mainText);
      if (onChangeCountry && parsedCountry) {
        onChangeCountry(parsedCountry);
      }
    } else {
      // country mode
      onChange(mainText);
    }

    // Reset autocomplete UI state
    setQuery(mainText);
    setSuggestions([]);
    setIsOpen(false);
    
    // Clear session token so next search gets a fresh session
    setSessionToken(null);
    if (onChangeSessionToken) {
      onChangeSessionToken(null);
    }
  };

  const handleManualInput = (val: string) => {
    setQuery(val);
    onChange(val);
    setIsOpen(true);

    // If query is cleared and we are in establishment mode, reset Place details
    if (!val.trim() && mode === "establishment") {
      if (onChangeGooglePlaceId) onChangeGooglePlaceId(null);
      if (onChangeFormattedAddress) onChangeFormattedAddress(null);
      setSessionToken(null);
      if (onChangeSessionToken) onChangeSessionToken(null);
    }
  };

  return (
    <div className="relative flex flex-col gap-1 w-full" ref={dropdownRef}>
      <div className="relative">
        <Input
          label={label}
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleManualInput(e.target.value)}
          onFocus={() => setIsOpen(true)}
          error={error}
        />
        {loading && (
          <div className="absolute right-3 bottom-3 flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-stone-300 border-t-stone-600"></div>
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-[calc(100%-2px)] left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-white rounded-xl border border-warm-200/80 shadow-lg py-1 select-none">
          {suggestions.map((s) => (
            <div
              key={s.place_id}
              onClick={() => handleSelect(s)}
              className="flex flex-col px-4 py-2.5 hover:bg-stone-50 transition-colors cursor-pointer border-b border-warm-100 last:border-b-0 text-left"
            >
              <span className="text-sm font-bold text-stone-800">
                {s.structured_formatting.main_text}
              </span>
              {s.structured_formatting.secondary_text && (
                <span className="text-xs text-stone-400 mt-0.5 truncate">
                  {s.structured_formatting.secondary_text}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
