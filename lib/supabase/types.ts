/**
 * Database types for the rofoof Supabase schema (see supabase/migrations).
 * Hand-authored to match 0001_init.sql + 0002_backend.sql. If you change the
 * schema, regenerate with:
 *   npx supabase gen types typescript --project-id kzcsriqzxgcdeikjmivg > lib/supabase/types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type BadgeType = "bestseller" | "new" | "waterproof";
export type OrderStatusDb = "review" | "accepted" | "shipped" | "delivered";
export type CouponType = "percent" | "fixed";
export type UserRole = "customer" | "admin";

type Timestamps = { created_at: string; updated_at: string };

export interface Database {
  public: {
    Tables: {
      provinces: {
        Row: { code: string; name_ar: string; name_en: string; sort_order: number };
        Insert: { code: string; name_ar: string; name_en: string; sort_order?: number };
        Update: Partial<Database["public"]["Tables"]["provinces"]["Insert"]>;
        Relationships: [];
      };
      categories: {
        Row: { code: string; name_ar: string; name_en: string; icon: string; sort_order: number };
        Insert: { code: string; name_ar: string; name_en: string; icon?: string; sort_order?: number };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      fandoms: {
        Row: { code: string; name_ar: string; name_en: string; sort_order: number };
        Insert: { code: string; name_ar: string; name_en: string; sort_order?: number };
        Update: Partial<Database["public"]["Tables"]["fandoms"]["Insert"]>;
        Relationships: [];
      };
      coupons: {
        Row: {
          code: string;
          discount_type: CouponType;
          value: number;
          min_subtotal: number;
          active: boolean;
          usage_limit: number | null;
          used_count: number;
          starts_at: string | null;
          ends_at: string | null;
          created_at: string;
        };
        Insert: {
          code: string;
          discount_type: CouponType;
          value: number;
          min_subtotal?: number;
          active?: boolean;
          usage_limit?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["coupons"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          role: UserRole;
          default_province_code: string | null;
        } & Timestamps;
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          role?: UserRole;
          default_province_code?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name_ar: string;
          name_en: string;
          sub_ar: string;
          sub_en: string;
          description_ar: string;
          description_en: string;
          price: number;
          emoji: string;
          image_url: string | null;
          images: string[];
          color: string;
          category_code: string;
          badge: BadgeType | null;
          tags: string[];
          waterproof: boolean;
          sold_out: boolean;
          is_active: boolean;
          stock: number;
          discount_percent: number;
          rating: number;
          reviews_count: number;
          sort_order: number;
        } & Timestamps;
        Insert: {
          id: string;
          name_ar: string;
          name_en: string;
          sub_ar?: string;
          sub_en?: string;
          description_ar?: string;
          description_en?: string;
          price: number;
          emoji?: string;
          image_url?: string | null;
          images?: string[];
          color?: string;
          category_code: string;
          badge?: BadgeType | null;
          tags?: string[];
          waterproof?: boolean;
          sold_out?: boolean;
          is_active?: boolean;
          stock?: number;
          discount_percent?: number;
          sort_order?: number;
          is_deleted?: boolean;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      product_categories: {
        Row: { product_id: string; category_code: string };
        Insert: { product_id: string; category_code: string };
        Update: Partial<{ product_id: string; category_code: string }>;
        Relationships: [];
      };
      product_fandoms: {
        Row: { product_id: string; fandom_code: string };
        Insert: { product_id: string; fandom_code: string };
        Update: Partial<{ product_id: string; fandom_code: string }>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          code: string;
          user_id: string | null;
          customer_name: string;
          customer_phone: string;
          province_code: string | null;
          address_line: string | null;
          notes: string | null;
          status: OrderStatusDb;
          coupon_code: string | null;
          subtotal: number;
          discount_total: number;
          delivery_fee: number;
          total: number;
          tracking: string | null;
        } & Timestamps;
        Insert: {
          user_id?: string | null;
          customer_name: string;
          customer_phone: string;
          province_code?: string | null;
          address_line?: string | null;
          notes?: string | null;
          status?: OrderStatusDb;
          coupon_code?: string | null;
          delivery_fee?: number;
          discount_total?: number;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]> & { status?: OrderStatusDb };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          name_ar_snapshot: string;
          name_en_snapshot: string;
          unit_price: number;
          qty: number;
          note: string | null;
          line_total: number;
        };
        Insert: {
          order_id: string;
          product_id?: string | null;
          name_ar_snapshot: string;
          name_en_snapshot: string;
          unit_price: number;
          qty: number;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>;
        Relationships: [];
      };
      order_status_events: {
        Row: { id: string; order_id: string; status: OrderStatusDb; note: string | null; created_at: string };
        Insert: { order_id: string; status: OrderStatusDb; note?: string | null };
        Update: Partial<{ status: OrderStatusDb; note: string | null }>;
        Relationships: [];
      };
      favorites: {
        Row: { user_id: string; product_id: string; created_at: string };
        Insert: { user_id: string; product_id: string };
        Update: Partial<{ user_id: string; product_id: string }>;
        Relationships: [];
      };
      settings: {
        Row: {
          id: boolean;
          announcement_ar: string | null;
          announcement_en: string | null;
          announcement_active: boolean;
          promo_code: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          announcement_ar?: string | null;
          announcement_en?: string | null;
          announcement_active?: boolean;
          promo_code?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          product_id: string;
          user_id: string;
          rating: number;
          title: string | null;
          body: string | null;
          created_at: string;
        };
        Insert: { product_id: string; user_id: string; rating: number; title?: string | null; body?: string | null };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      daily_revenue: {
        Row: { day: string | null; revenue: number | null; orders: number | null };
        Relationships: [];
      };
    };
    Functions: {
      get_order_tracking: { Args: { p_code: string }; Returns: Json };
      place_order: {
        Args: {
          p_customer_name: string;
          p_customer_phone: string;
          p_province_code: string | null;
          p_address_line: string | null;
          p_notes: string | null;
          p_items: Json;
          p_coupon_code: string | null;
        };
        Returns: Json;
      };
      dashboard_stats: { Args: Record<string, never>; Returns: Json };
      admin_customers: { Args: { p_limit: number; p_offset: number }; Returns: Json };
      admin_set_product_categories: { Args: { p_id: string; p_codes: string[] }; Returns: string[] };
      admin_create_category: {
        Args: { p_code: string; p_name_ar: string; p_name_en: string };
        Returns: Json;
      };
      admin_set_product_fandoms: { Args: { p_id: string; p_codes: string[] }; Returns: string[] };
      admin_create_fandom: {
        Args: { p_code: string; p_name_ar: string; p_name_en: string };
        Returns: Json;
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      badge_type: BadgeType;
      order_status: OrderStatusDb;
      coupon_type: CouponType;
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
}

/* Convenience row aliases */
export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type FandomRow = Database["public"]["Tables"]["fandoms"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
