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
}

export interface MediaResponse {
  id: string;
  url: string;
  mime_type: string;
  order_index: number;
}

export interface EntryResponse {
  id: string;
  user: Pick<UserResponse, "id" | "username" | "display_name" | "avatar_url">;
  dish_name: string;
  restaurant_name: string | null;
  city: string | null;
  country: string | null;
  price_level: number | null;
  rating: number;
  notes: string | null;
  visibility: "public" | "friends" | "private";
  media: MediaResponse[];
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
  created_at: string;
}

export interface AuthTokensResponse {
  access_token: string;
  user: UserResponse;
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
}
