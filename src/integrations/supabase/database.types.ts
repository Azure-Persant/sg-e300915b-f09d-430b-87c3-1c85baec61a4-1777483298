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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      collection_shares: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          include_loaned: boolean
          include_personal: boolean
          include_sale: boolean
          invited_email: string | null
          label: string | null
          owner_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          include_loaned?: boolean
          include_personal?: boolean
          include_sale?: boolean
          invited_email?: string | null
          label?: string | null
          owner_id: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          include_loaned?: boolean
          include_personal?: boolean
          include_sale?: boolean
          invited_email?: string | null
          label?: string | null
          owner_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_locations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          card_number: string
          card_type: string
          class: string | null
          classes: string[]
          cost: number | null
          cost_memory: number | null
          cost_reserve: number | null
          created_at: string | null
          effect_text: string | null
          element: string | null
          flavor_text: string | null
          id: string
          illustrator: string | null
          image_url: string | null
          is_restricted: boolean | null
          life: number | null
          name: string
          power: number | null
          rarity: string
          set_id: string | null
          speed: string | null
          subtypes: string[]
          types: string[]
        }
        Insert: {
          card_number: string
          card_type: string
          class?: string | null
          classes?: string[]
          cost?: number | null
          cost_memory?: number | null
          cost_reserve?: number | null
          created_at?: string | null
          effect_text?: string | null
          element?: string | null
          flavor_text?: string | null
          id?: string
          illustrator?: string | null
          image_url?: string | null
          is_restricted?: boolean | null
          life?: number | null
          name: string
          power?: number | null
          rarity: string
          set_id?: string | null
          speed?: string | null
          subtypes?: string[]
          types?: string[]
        }
        Update: {
          card_number?: string
          card_type?: string
          class?: string | null
          classes?: string[]
          cost?: number | null
          cost_memory?: number | null
          cost_reserve?: number | null
          created_at?: string | null
          effect_text?: string | null
          element?: string | null
          flavor_text?: string | null
          id?: string
          illustrator?: string | null
          image_url?: string | null
          is_restricted?: boolean | null
          life?: number | null
          name?: string
          power?: number | null
          rarity?: string
          set_id?: string | null
          speed?: string | null
          subtypes?: string[]
          types?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cards_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_cards: {
        Row: {
          card_id: string
          created_at: string | null
          deck_id: string
          id: string
          quantity: number
        }
        Insert: {
          card_id: string
          created_at?: string | null
          deck_id: string
          id?: string
          quantity?: number
        }
        Update: {
          card_id?: string
          created_at?: string | null
          deck_id?: string
          id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sets: {
        Row: {
          code: string
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          rank: number
          release_date: string | null
          total_cards: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          rank?: number
          release_date?: string | null
          total_cards?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          rank?: number
          release_date?: string | null
          total_cards?: number | null
        }
        Relationships: []
      }
      sync_history: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          pages_fetched: number | null
          started_at: string | null
          status: string | null
          total_cards_processed: number | null
          total_sets_processed: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          pages_fetched?: number | null
          started_at?: string | null
          status?: string | null
          total_cards_processed?: number | null
          total_sets_processed?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          pages_fetched?: number | null
          started_at?: string | null
          status?: string | null
          total_cards_processed?: number | null
          total_sets_processed?: number | null
        }
        Relationships: []
      }
      user_collections: {
        Row: {
          bucket: string
          card_id: string
          created_at: string
          id: string
          loaned_to_user_id: string | null
          location: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket: string
          card_id: string
          created_at?: string
          id?: string
          loaned_to_user_id?: string | null
          location?: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket?: string
          card_id?: string
          created_at?: string
          id?: string
          loaned_to_user_id?: string | null
          location?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_collections_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      card_filter_options: {
        Row: {
          card_count: number | null
          kind: string | null
          value: string | null
        }
        Relationships: []
      }
      card_catalog: {
        Row: {
          card_number: string | null
          card_type: string | null
          class: string | null
          classes: string[] | null
          cost: number | null
          cost_memory: number | null
          cost_reserve: number | null
          effect_text: string | null
          element: string | null
          id: string | null
          illustrator: string | null
          image_url: string | null
          is_restricted: boolean | null
          life: number | null
          name: string | null
          power: number | null
          printing_count: number | null
          rarity: string | null
          set_code: string | null
          set_codes: string[] | null
          set_id: string | null
          set_name: string | null
          set_rank: number | null
          speed: string | null
          subtypes: string[] | null
          types: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_email: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      shared_collection: {
        Args: { p_token: string }
        Returns: {
          card_id: string
          card_name: string
          set_code: string | null
          set_name: string | null
          rarity: string
          image_url: string | null
          card_type: string
          element: string | null
          cost: number | null
          power: number | null
          life: number | null
          speed: string | null
          effect_text: string | null
          personal_quantity: number
          sale_quantity: number
          loaned_quantity: number
        }[]
      }
      shared_collection_meta: {
        Args: { p_token: string }
        Returns: {
          owner_name: string
          label: string | null
          include_personal: boolean
          include_sale: boolean
          include_loaned: boolean
          expires_at: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
