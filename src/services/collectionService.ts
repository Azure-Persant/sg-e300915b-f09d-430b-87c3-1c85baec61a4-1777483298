import { supabase } from "@/integrations/supabase/client";
import type { Card } from "./cardService";

export interface CollectionItem {
  id: string;
  user_id: string;
  card_id: string;
  quantity: number;
  location: string | null;
  created_at: string;
  updated_at: string;
  card?: Card;
}

export interface CollectionStats {
  totalCards: number;
  totalQuantity: number;
  uniqueCards: number;
}

export const collectionService = {
  // Get user's entire collection
  async getCollection(userId: string): Promise<CollectionItem[]> {
    const { data, error } = await supabase
      .from("user_collections")
      .select(`
        *,
        card:cards(*)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching collection:", error);
      throw error;
    }

    return (data || []).map(item => ({
      ...item,
      card: item.card as Card
    }));
  },

  // Get collection stats
  async getCollectionStats(userId: string): Promise<CollectionStats> {
    const { data, error } = await supabase
      .from("user_collections")
      .select("quantity")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching collection stats:", error);
      throw error;
    }

    const totalQuantity = data?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const uniqueCards = data?.length || 0;

    return {
      totalCards: uniqueCards,
      totalQuantity,
      uniqueCards,
    };
  },

  // Add or update card in collection
  async addCard(userId: string, cardId: string, quantity: number, location?: string): Promise<void> {
    const { error } = await supabase
      .from("user_collections")
      .upsert({
        user_id: userId,
        card_id: cardId,
        quantity,
        location: location || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,card_id",
      });

    if (error) {
      console.error("Error adding card to collection:", error);
      throw error;
    }
  },

  // Update card quantity and/or location
  async updateCard(userId: string, cardId: string, quantity: number, location?: string): Promise<void> {
    const { error } = await supabase
      .from("user_collections")
      .update({
        quantity,
        location: location || null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("card_id", cardId);

    if (error) {
      console.error("Error updating card in collection:", error);
      throw error;
    }
  },

  // Remove card from collection
  async removeCard(userId: string, cardId: string): Promise<void> {
    const { error } = await supabase
      .from("user_collections")
      .delete()
      .eq("user_id", userId)
      .eq("card_id", cardId);

    if (error) {
      console.error("Error removing card from collection:", error);
      throw error;
    }
  },

  // Check if user owns a specific card
  async getCardOwnership(userId: string, cardId: string): Promise<CollectionItem | null> {
    const { data, error } = await supabase
      .from("user_collections")
      .select("*")
      .eq("user_id", userId)
      .eq("card_id", cardId)
      .maybeSingle();

    if (error) {
      console.error("Error checking card ownership:", error);
      throw error;
    }

    return data;
  },

  // Bulk add cards (for importing collections)
  async bulkAddCards(userId: string, cards: Array<{ cardId: string; quantity: number; location?: string }>): Promise<void> {
    const items = cards.map(card => ({
      user_id: userId,
      card_id: card.cardId,
      quantity: card.quantity,
      location: card.location || null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("user_collections")
      .upsert(items, {
        onConflict: "user_id,card_id",
      });

    if (error) {
      console.error("Error bulk adding cards:", error);
      throw error;
    }
  },
};