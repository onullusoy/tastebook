export interface UserResponse {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  follower_count?: number;
  following_count?: number;
  is_following?: boolean;
  is_friend?: boolean;
  gourme_points?: number;
  metadata?: Record<string, any> | null;
}

export interface MediaResponse {
  id: string;
  url: string;
  thumbnail_url: string;
  mime_type: string;
  order_index: number;
}

export interface FoodItemResponse {
  id: string;
  name: string;
  notes: string | null;
  order_index: number;
}

export interface EntryResponse {
  id: string;
  user: Pick<UserResponse, "id" | "username" | "display_name" | "avatar_url">;

  // Location
  restaurant_name: string;
  city: string;
  country: string;
  google_place_id: string | null;
  formatted_address: string | null;

  // Atmosphere & Pricing
  atmosphere_tags: string[];
  price_level: number;

  // Ratings
  rating: number;
  rating_ambience: number | null;
  rating_taste: number | null;
  rating_service: number | null;
  rating_value: number | null;

  // Food items
  food_items: FoodItemResponse[];

  // Commentary & Privacy
  notes: string | null;
  visibility: "public" | "friends" | "private";

  // Media
  media: MediaResponse[];

  // List association
  list_id: string | null;

  // Social interactions
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;

  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface CollaboratorResponse {
  id: string;
  user: Pick<UserResponse, "id" | "username" | "display_name" | "avatar_url">;
  role: "contributor" | "editor";
  created_at: string;
}

export interface ListResponse {
  id: string;
  user: Pick<UserResponse, "id" | "username" | "display_name" | "avatar_url">;
  title: string;
  description: string | null;
  visibility: "public" | "friends" | "private";
  cover_image_url: string | null;
  item_count: number;
  collaborators: CollaboratorResponse[];
  is_collaborative: boolean;
  metadata?: Record<string, any> | null;
  created_at: string;
  likes_count: number;
  is_liked?: boolean;
  feed_entry_id?: string | null;
}

export interface AuthTokensResponse {
  access_token: string;
  user: UserResponse;
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
  is_recommended?: boolean;
}

export interface ApiResponse<T> {
  data: T;
}

export interface RestaurantStats {
  rating_avg: number;
  rating_count: number;
  price_level_avg: number;
  dominant_tags: string[];
}

export interface RestaurantResponse {
  google_place_id: string;
  name: string;
  city: string;
  country: string;
  is_local: boolean;
  stats: RestaurantStats | null;
  formatted_address?: string | null;
  photos?: string[];
  metadata?: Record<string, any> | null;
}

export interface RestaurantDetailResponse {
  restaurant: RestaurantResponse;
  my_entries: EntryResponse[];
  network_entries: EntryResponse[];
  public_entries: EntryResponse[];
}
