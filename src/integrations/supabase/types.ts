export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          name: string
          slug: string
          sort_order: number
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          slug: string
          sort_order?: number
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          sort_order?: number
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          discount_cents: number
          id: string
          order_id: string
          user_id: string | null
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_cents: number
          id?: string
          order_id: string
          user_id?: string | null
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_cents?: number
          id?: string
          order_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_discount_cents: number | null
          min_order_cents: number
          per_user_limit: number | null
          starts_at: string | null
          type: Database["public"]["Enums"]["coupon_type_enum"]
          updated_at: string
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_cents?: number | null
          min_order_cents?: number
          per_user_limit?: number | null
          starts_at?: string | null
          type: Database["public"]["Enums"]["coupon_type_enum"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_cents?: number | null
          min_order_cents?: number
          per_user_limit?: number | null
          starts_at?: string | null
          type?: Database["public"]["Enums"]["coupon_type_enum"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      delivery_addresses: {
        Row: {
          city: string
          created_at: string
          customer_id: string | null
          email: string
          full_name: string
          id: string
          instructions: string | null
          is_default: boolean
          is_saved: boolean
          label: string | null
          line1: string
          line2: string | null
          phone: string
          state: string
          zip: string
        }
        Insert: {
          city: string
          created_at?: string
          customer_id?: string | null
          email: string
          full_name: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          is_saved?: boolean
          label?: string | null
          line1: string
          line2?: string | null
          phone: string
          state: string
          zip: string
        }
        Update: {
          city?: string
          created_at?: string
          customer_id?: string | null
          email?: string
          full_name?: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          is_saved?: boolean
          label?: string | null
          line1?: string
          line2?: string | null
          phone?: string
          state?: string
          zip?: string
        }
        Relationships: []
      }
      distributor_inventory: {
        Row: {
          distributor_id: string
          id: string
          product_id: string
          stock_qty: number
          updated_at: string
        }
        Insert: {
          distributor_id: string
          id?: string
          product_id: string
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          distributor_id?: string
          id?: string
          product_id?: string
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_inventory_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      distributors: {
        Row: {
          can_supply: boolean
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          can_supply?: boolean
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          can_supply?: boolean
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          distributor_id: string | null
          id: string
          new_qty: number
          note: string | null
          previous_qty: number
          product_id: string
          reason: Database["public"]["Enums"]["inventory_reason_enum"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          distributor_id?: string | null
          id?: string
          new_qty: number
          note?: string | null
          previous_qty: number
          product_id: string
          reason: Database["public"]["Enums"]["inventory_reason_enum"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          distributor_id?: string | null
          id?: string
          new_qty?: number
          note?: string | null
          previous_qty?: number
          product_id?: string
          reason?: Database["public"]["Enums"]["inventory_reason_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          is_unavailable: boolean
          name_snapshot: string
          order_id: string
          ordered_qty: number
          picked_qty: number | null
          product_id: string | null
          replacement_product_id: string | null
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_unavailable?: boolean
          name_snapshot: string
          order_id: string
          ordered_qty: number
          picked_qty?: number | null
          product_id?: string | null
          replacement_product_id?: string | null
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          is_unavailable?: boolean
          name_snapshot?: string
          order_id?: string
          ordered_qty?: number
          picked_qty?: number | null
          product_id?: string | null
          replacement_product_id?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          confirmed_at: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          customer_notes: string | null
          delivery_address_id: string
          delivery_charge: number
          delivery_instructions: string | null
          discount: number
          distributor_id: string
          id: string
          idempotency_key: string | null
          order_number: string
          order_status: Database["public"]["Enums"]["order_status_enum"]
          packed_at: string | null
          packing_started_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method_enum"]
          payment_status: Database["public"]["Enums"]["payment_status_enum"]
          picking_started_at: string | null
          ready_for_delivery_at: string | null
          sent_for_delivery_at: string | null
          substitution_preference: Database["public"]["Enums"]["substitution_pref_enum"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          wallet_credit_cents: number
        }
        Insert: {
          confirmed_at?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          delivery_address_id: string
          delivery_charge?: number
          delivery_instructions?: string | null
          discount?: number
          distributor_id: string
          id?: string
          idempotency_key?: string | null
          order_number: string
          order_status?: Database["public"]["Enums"]["order_status_enum"]
          packed_at?: string | null
          packing_started_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method_enum"]
          payment_status?: Database["public"]["Enums"]["payment_status_enum"]
          picking_started_at?: string | null
          ready_for_delivery_at?: string | null
          sent_for_delivery_at?: string | null
          substitution_preference?: Database["public"]["Enums"]["substitution_pref_enum"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          wallet_credit_cents?: number
        }
        Update: {
          confirmed_at?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          delivery_address_id?: string
          delivery_charge?: number
          delivery_instructions?: string | null
          discount?: number
          distributor_id?: string
          id?: string
          idempotency_key?: string | null
          order_number?: string
          order_status?: Database["public"]["Enums"]["order_status_enum"]
          packed_at?: string | null
          packing_started_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method_enum"]
          payment_status?: Database["public"]["Enums"]["payment_status_enum"]
          picking_started_at?: string | null
          ready_for_delivery_at?: string | null
          sent_for_delivery_at?: string | null
          substitution_preference?: Database["public"]["Enums"]["substitution_pref_enum"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          wallet_credit_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "delivery_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          mrp_cents: number | null
          name: string
          price_cents: number
          slug: string
          stock_qty: number
          tags: string[]
          unit_label: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          mrp_cents?: number | null
          name: string
          price_cents: number
          slug: string
          stock_qty?: number
          tags?: string[]
          unit_label?: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          mrp_cents?: number | null
          name?: string
          price_cents?: number
          slug?: string
          stock_qty?: number
          tags?: string[]
          unit_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          referral_code: string
          referred_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          referral_code: string
          referred_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          referral_code?: string
          referred_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referral_commissions: {
        Row: {
          approved_at: string | null
          beneficiary_user_id: string
          buyer_id: string
          cancelled_at: string | null
          commission_amount_cents: number
          commission_percentage: number
          created_at: string
          id: string
          order_amount_cents: number
          order_id: string
          paid_at: string | null
          referral_level: number
          status: Database["public"]["Enums"]["referral_commission_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          beneficiary_user_id: string
          buyer_id: string
          cancelled_at?: string | null
          commission_amount_cents: number
          commission_percentage: number
          created_at?: string
          id?: string
          order_amount_cents: number
          order_id: string
          paid_at?: string | null
          referral_level: number
          status?: Database["public"]["Enums"]["referral_commission_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          beneficiary_user_id?: string
          buyer_id?: string
          cancelled_at?: string | null
          commission_amount_cents?: number
          commission_percentage?: number
          created_at?: string
          id?: string
          order_amount_cents?: number
          order_id?: string
          paid_at?: string | null
          referral_level?: number
          status?: Database["public"]["Enums"]["referral_commission_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_areas: {
        Row: {
          created_at: string
          distributor_id: string
          id: string
          pincode: string
        }
        Insert: {
          created_at?: string
          distributor_id: string
          id?: string
          pincode: string
        }
        Update: {
          created_at?: string
          distributor_id?: string
          id?: string
          pincode?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_areas_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_requests: {
        Row: {
          admin_note: string | null
          approved_qty: number | null
          created_at: string
          fulfilled_by_distributor_id: string | null
          id: string
          note: string | null
          product_id: string
          requested_at: string
          requested_by: string | null
          requested_qty: number
          requesting_distributor_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["stock_transfer_status_enum"]
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          approved_qty?: number | null
          created_at?: string
          fulfilled_by_distributor_id?: string | null
          id?: string
          note?: string | null
          product_id: string
          requested_at?: string
          requested_by?: string | null
          requested_qty: number
          requesting_distributor_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["stock_transfer_status_enum"]
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          approved_qty?: number | null
          created_at?: string
          fulfilled_by_distributor_id?: string | null
          id?: string
          note?: string | null
          product_id?: string
          requested_at?: string
          requested_by?: string | null
          requested_qty?: number
          requesting_distributor_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["stock_transfer_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_requests_fulfilled_by_distributor_id_fkey"
            columns: ["fulfilled_by_distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_requests_requesting_distributor_id_fkey"
            columns: ["requesting_distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          delivery_charge_cents: number
          free_delivery_threshold_cents: number
          id: boolean
          store_name: string
          support_email: string | null
          support_phone: string | null
          tax_rate_bps: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          delivery_charge_cents?: number
          free_delivery_threshold_cents?: number
          id?: boolean
          store_name?: string
          support_email?: string | null
          support_phone?: string | null
          tax_rate_bps?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          delivery_charge_cents?: number
          free_delivery_threshold_cents?: number
          id?: boolean
          store_name?: string
          support_email?: string | null
          support_phone?: string | null
          tax_rate_bps?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          distributor_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          distributor_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          distributor_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      referral_earnings: {
        Row: {
          approved_cents: number | null
          beneficiary_user_id: string | null
          commission_count: number | null
          paid_cents: number | null
          pending_cents: number | null
          total_earned_cents: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_stock_transfer: {
        Args: {
          _admin_note: string
          _approved_qty: number
          _fulfilled_by_distributor_id: string
          _request_id: string
          _reviewed_by: string
        }
        Returns: undefined
      }
      generate_order_number: { Args: never; Returns: string }
      generate_referral_code: { Args: never; Returns: string }
      get_my_distributor_id: { Args: never; Returns: string }
      get_wallet_balance: { Args: { _user_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_guest_order: { Args: { _order_id: string }; Returns: boolean }
      is_referral_eligible_order: {
        Args: { _order: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: boolean
      }
      process_referral_commissions_for_order: {
        Args: { _order_id: string }
        Returns: undefined
      }
      record_order_stock_decrement: {
        Args: { _order_id: string }
        Returns: undefined
      }
      redeem_coupon_atomic: {
        Args: {
          _coupon_id: string
          _discount_cents: number
          _order_id: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "customer" | "staff" | "admin" | "distributor"
      coupon_type_enum: "percentage" | "fixed"
      inventory_reason_enum:
        | "restock"
        | "correction"
        | "order"
        | "damage"
        | "return"
      order_status_enum:
        | "order_placed"
        | "payment_confirmed"
        | "order_confirmed"
        | "picking_items"
        | "packing"
        | "ready_for_delivery"
        | "sent_for_delivery"
        | "cancelled"
        | "refunded"
        | "completed"
      payment_method_enum: "cod"
      payment_status_enum: "pending" | "confirmed" | "failed" | "refunded"
      referral_commission_status: "pending" | "approved" | "paid" | "cancelled"
      stock_transfer_status_enum: "pending" | "approved" | "rejected"
      substitution_pref_enum:
        | "replace_similar"
        | "refund_if_unavailable"
        | "contact_me"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "staff", "admin", "distributor"],
      coupon_type_enum: ["percentage", "fixed"],
      inventory_reason_enum: [
        "restock",
        "correction",
        "order",
        "damage",
        "return",
      ],
      order_status_enum: [
        "order_placed",
        "payment_confirmed",
        "order_confirmed",
        "picking_items",
        "packing",
        "ready_for_delivery",
        "sent_for_delivery",
        "cancelled",
        "refunded",
        "completed",
      ],
      payment_method_enum: ["cod"],
      payment_status_enum: ["pending", "confirmed", "failed", "refunded"],
      referral_commission_status: ["pending", "approved", "paid", "cancelled"],
      stock_transfer_status_enum: ["pending", "approved", "rejected"],
      substitution_pref_enum: [
        "replace_similar",
        "refund_if_unavailable",
        "contact_me",
      ],
    },
  },
} as const
