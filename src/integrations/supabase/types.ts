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
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
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
          line1?: string
          line2?: string | null
          phone?: string
          state?: string
          zip?: string
        }
        Relationships: []
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
          created_at: string
          customer_id: string | null
          customer_notes: string | null
          delivery_address_id: string
          delivery_charge: number
          delivery_instructions: string | null
          discount: number
          id: string
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
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          delivery_address_id: string
          delivery_charge?: number
          delivery_instructions?: string | null
          discount?: number
          id?: string
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
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          delivery_address_id?: string
          delivery_charge?: number
          delivery_instructions?: string | null
          discount?: number
          id?: string
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
        }
        Relationships: [
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "delivery_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          price_cents: number
          slug: string
          stock_qty: number
          unit_label: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          price_cents: number
          slug: string
          stock_qty?: number
          unit_label?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price_cents?: number
          slug?: string
          stock_qty?: number
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
          referral_code?: string
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
      generate_referral_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_referral_commissions_for_order: {
        Args: { _order_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "customer" | "staff" | "admin"
      order_status_enum:
        | "order_placed"
        | "payment_confirmed"
        | "order_confirmed"
        | "picking_items"
        | "packing"
        | "ready_for_delivery"
        | "sent_for_delivery"
        | "completed"
        | "cancelled"
        | "refunded"
      payment_method_enum: "cod"
      payment_status_enum: "pending" | "confirmed" | "failed" | "refunded"
      referral_commission_status:
        | "pending"
        | "approved"
        | "paid"
        | "cancelled"
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
      app_role: ["customer", "staff", "admin"],
      order_status_enum: [
        "order_placed",
        "payment_confirmed",
        "order_confirmed",
        "picking_items",
        "packing",
        "ready_for_delivery",
        "sent_for_delivery",
        "completed",
        "cancelled",
        "refunded",
      ],
      payment_method_enum: ["cod"],
      payment_status_enum: ["pending", "confirmed", "failed", "refunded"],
      referral_commission_status: [
        "pending",
        "approved",
        "paid",
        "cancelled",
      ],
      substitution_pref_enum: [
        "replace_similar",
        "refund_if_unavailable",
        "contact_me",
      ],
    },
  },
} as const
