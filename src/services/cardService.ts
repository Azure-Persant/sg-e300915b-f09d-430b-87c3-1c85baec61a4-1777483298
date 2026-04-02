import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Card = Tables<"cards">;
export type Set = Tables<"sets">;
export type UserCollection = Tables<"user_collections">;

export interface CardWithSet extends Card {
  sets: Set | null;
}

export interface CollectionCard extends Card {
  sets: Set | null;
  user_collections: UserCollection[];
}

export const cardService = {
  async getAllSets() {
    const { data, error } = await supabase
      .from("sets")
      .select("*")
      .order("release_date", { ascending: false });

    console.log("getAllSets:", { data, error });
    if (error) throw error;
    return data || [];
  },

  async getCards(filters?: {
    setId?: string;
    rarity?: string;
    cardType?: string;
    element?: string;
    search?: string;
  }) {
    const allCards: CardWithSet[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    // Fetch all cards in batches of 1000 to bypass Supabase's limit
    while (hasMore) {
      let query = supabase
        .from("cards")
        .select("*, sets(*)")
        .order("name", { ascending: true })
        .range(from, from + batchSize - 1);

      if (filters?.setId) {
        query = query.eq("set_id", filters.setId);
      }
      if (filters?.rarity) {
        query = query.eq("rarity", filters.rarity);
      }
      if (filters?.cardType) {
        query = query.eq("card_type", filters.cardType);
      }
      if (filters?.element) {
        query = query.eq("element", filters.element);
      }
      if (filters?.search) {
        query = query.ilike("name", `%${filters.search}%`);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error("getCards batch error:", error);
        throw error;
      }

      if (data && data.length > 0) {
        allCards.push(...(data as CardWithSet[]));
        console.log(`Fetched batch: ${from}-${from + data.length} (${data.length} cards)`);
        
        // If we got less than batchSize, we've reached the end
        hasMore = data.length === batchSize;
        from += batchSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`getCards: Total fetched ${allCards.length} cards`);
    return allCards;
  },

  async getCardById(cardId: string) {
    const { data, error } = await supabase
      .from("cards")
      .select("*, sets(*)")
      .eq("id", cardId)
      .single();

    console.log("getCardById:", { data, error });
    if (error) throw error;
    return data as CardWithSet;
  },

  async getUserCollection(userId: string, filters?: {
    setId?: string;
    rarity?: string;
    cardType?: string;
    element?: string;
    search?: string;
  }) {
    let query = supabase
      .from("cards")
      .select(`
        *,
        sets(*),
        user_collections!inner(user_id, quantity, location)
      `)
      .eq("user_collections.user_id", userId)
      .order("name", { ascending: true });

    if (filters?.setId) {
      query = query.eq("set_id", filters.setId);
    }
    if (filters?.rarity) {
      query = query.eq("rarity", filters.rarity);
    }
    if (filters?.cardType) {
      query = query.eq("card_type", filters.cardType);
    }
    if (filters?.element) {
      query = query.eq("element", filters.element);
    }
    if (filters?.search) {
      query = query.ilike("name", `%${filters.search}%`);
    }

    const { data, error } = await query;
    console.log("getUserCollection:", { data, error });
    if (error) throw error;
    return (data || []) as CollectionCard[];
  },

  async updateCollection(userId: string, cardId: string, quantity: number, location?: string) {
    if (quantity === 0) {
      const { error } = await supabase
        .from("user_collections")
        .delete()
        .eq("user_id", userId)
        .eq("card_id", cardId);

      console.log("deleteCollection:", { error });
      if (error) throw error;
      return;
    }

    const { data, error } = await supabase
      .from("user_collections")
      .upsert({
        user_id: userId,
        card_id: cardId,
        quantity,
        location: location || null,
      })
      .select()
      .single();

    console.log("updateCollection:", { data, error });
    if (error) throw error;
    return data;
  },

  async getCollectionStats(userId: string) {
    const { data, error } = await supabase
      .from("user_collections")
      .select("quantity")
      .eq("user_id", userId);

    console.log("getCollectionStats:", { data, error });
    if (error) throw error;

    const totalCards = (data || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const uniqueCards = (data || []).length;

    return { totalCards, uniqueCards };
  },
};