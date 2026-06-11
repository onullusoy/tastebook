import { createDb, restaurants } from "@tastebook/db";
import { eq } from "drizzle-orm";
import { EntriesService } from "../entries/entries.service";
import type { RestaurantDetailResponse, RestaurantResponse } from "@tastebook/shared/api-types";

export class RestaurantsService {
  constructor(
    private db: ReturnType<typeof createDb>,
    private entriesService: EntriesService,
    private apiKey?: string
  ) {}

  private parseAddressComponents(components: any[]): { city: string; country: string } {
    let city = "";
    let country = "";

    for (const comp of components) {
      if (comp.types.includes("locality")) {
        city = comp.long_name;
      } else if (!city && comp.types.includes("administrative_area_level_2")) {
        city = comp.long_name;
      } else if (!city && comp.types.includes("administrative_area_level_1")) {
        city = comp.long_name;
      }
      
      if (comp.types.includes("country")) {
        country = comp.long_name;
      }
    }

    return { city: city || "Unknown", country: country || "Unknown" };
  }

  async getRestaurantDetail(placeId: string, reqUserId: string): Promise<RestaurantDetailResponse> {
    let restaurantRow = await this.db.query.restaurants.findFirst({
      where: eq(restaurants.googlePlaceId, placeId),
    });

    let formattedAddress: string | null = null;
    let photos: string[] = [];

    if (this.apiKey) {
      try {
        const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
        url.searchParams.set("place_id", placeId);
        url.searchParams.set("fields", "name,address_components,formatted_address,photos");
        url.searchParams.set("key", this.apiKey);

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.status === "OK" && data.result) {
            formattedAddress = data.result.formatted_address || null;
            if (data.result.photos) {
              photos = data.result.photos.map((p: any) => p.photo_reference).slice(0, 5);
            }

            if (!restaurantRow) {
              const name = data.result.name || "Unknown Restaurant";
              let city = "Unknown";
              let country = "Unknown";
              if (data.result.address_components) {
                const parsed = this.parseAddressComponents(data.result.address_components);
                city = parsed.city;
                country = parsed.country;
              }

              const [newRestaurant] = await this.db
                .insert(restaurants)
                .values({
                  googlePlaceId: placeId,
                  name,
                  city,
                  country,
                  ratingAvg: "0.0",
                  ratingCount: 0,
                  priceLevelAvg: "0.0",
                  atmosphereTags: [],
                  metadata: {},
                })
                .returning();
              restaurantRow = newRestaurant;
            }
          }
        }
      } catch (err) {
        console.error("Google Place Details fetch failed in getRestaurantDetail:", err);
      }
    }

    if (!restaurantRow) {
      const [newRestaurant] = await this.db
        .insert(restaurants)
        .values({
          googlePlaceId: placeId,
          name: "Unknown Restaurant",
          city: "Unknown",
          country: "Unknown",
          ratingAvg: "0.0",
          ratingCount: 0,
          priceLevelAvg: "0.0",
          atmosphereTags: [],
          metadata: {},
        })
        .returning();
      restaurantRow = newRestaurant;
    }

    const { my_entries, network_entries, public_entries } = 
      await this.entriesService.getSegmentedEntriesForRestaurant(placeId, reqUserId);

    const restaurant: RestaurantResponse = {
      google_place_id: restaurantRow.googlePlaceId,
      name: restaurantRow.name,
      city: restaurantRow.city,
      country: restaurantRow.country,
      is_local: true,
      formatted_address: formattedAddress,
      photos,
      stats: {
        rating_avg: Number(restaurantRow.ratingAvg),
        rating_count: restaurantRow.ratingCount,
        price_level_avg: Number(restaurantRow.priceLevelAvg),
        dominant_tags: restaurantRow.atmosphereTags || [],
      },
      metadata: restaurantRow.metadata,
    };

    return {
      restaurant,
      my_entries,
      network_entries,
      public_entries,
    };
  }
}
