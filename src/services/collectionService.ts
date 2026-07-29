import { supabase } from "@/integrations/supabase/client";
import type { Card } from "./cardService";

export interface CollectionItem {
  id: string;
  user_id: string;
  card_id: string;
  /** Copies kept for personal use. */
  quantity: number;
  location: string | null;
  /** Copies available for sale or trade, counted separately from quantity. */
  sale_quantity: number;
  sale_location: string | null;
  /** Copies lent out, counted separately from quantity. */
  loaned_quantity: number;
  loaned_to: string | null;
  loaned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
  card?: Card;
}

export interface CollectionStats {
  totalCards: number;
  totalQuantity: number;
  uniqueCards: number;
  /** Copies across the for-sale bucket, and how many distinct cards have any. */
  forSaleQuantity: number;
  forSaleCards: number;
  /** Copies currently lent out, and how many distinct cards are affected. */
  loanedQuantity: number;
  loanedCards: number;
}

/**
 * A holding is three independent buckets: personal, for sale, and loaned out.
 * They are counted separately rather than carved out of each other, so 3 personal
 * + 2 for sale + 1 lent is 6 copies held. Omitted fields are left alone rather
 * than reset, so editing one bucket never silently clears another.
 */
export interface HoldingInput {
  quantity?: number;
  location?: string | null;
  saleQuantity?: number;
  saleLocation?: string | null;
  loanedQuantity?: number;
  /** Required by the database whenever loanedQuantity is above 0. */
  loanedTo?: string | null;
  loanedToUserId?: string | null;
}

/** Maps the camelCase input to columns, dropping keys the caller did not set. */
const holdingColumns = (holding: HoldingInput) => {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (holding.quantity !== undefined) row.quantity = holding.quantity;
  if (holding.location !== undefined) row.location = holding.location || null;
  if (holding.saleQuantity !== undefined) row.sale_quantity = holding.saleQuantity;
  if (holding.saleLocation !== undefined) row.sale_location = holding.saleLocation || null;
  if (holding.loanedQuantity !== undefined) row.loaned_quantity = holding.loanedQuantity;
  if (holding.loanedTo !== undefined) row.loaned_to = holding.loanedTo || null;
  if (holding.loanedToUserId !== undefined) row.loaned_to_user_id = holding.loanedToUserId || null;

  // user_collections_loan_has_borrower rejects a loan with no borrower named.
  // Clearing the loan clears the borrower too, so returning cards never leaves
  // a stale name behind.
  if (row.loaned_quantity === 0) {
    row.loaned_to = null;
    row.loaned_to_user_id = null;
  }
  return row;
};

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
      .select("quantity, sale_quantity, loaned_quantity")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching collection stats:", error);
      throw error;
    }

    const rows = data ?? [];
    const totalQuantity = rows.reduce((sum, item) => sum + item.quantity, 0);
    const forSaleQuantity = rows.reduce((sum, item) => sum + (item.sale_quantity ?? 0), 0);
    const loanedQuantity = rows.reduce((sum, item) => sum + (item.loaned_quantity ?? 0), 0);

    // uniqueCards counts rows, which is one per printing held — a card kept in
    // three sets counts three times, matching what the collection page lists.
    const uniqueCards = rows.length;

    return {
      totalCards: uniqueCards,
      totalQuantity,
      uniqueCards,
      forSaleQuantity,
      forSaleCards: rows.filter((item) => (item.sale_quantity ?? 0) > 0).length,
      loanedQuantity,
      loanedCards: rows.filter((item) => (item.loaned_quantity ?? 0) > 0).length,
    };
  },

  /**
   * Add or update a holding. On conflict only the columns present in `holding`
   * are written, so adding personal copies from /cards cannot wipe a sale count
   * that was set on /collection.
   */
  async addCard(
    userId: string,
    cardId: string,
    holding: HoldingInput | number,
    location?: string
  ): Promise<void> {
    // Tolerates the older (quantity, location) positional form.
    const input: HoldingInput =
      typeof holding === "number" ? { quantity: holding, location } : holding;

    const { error } = await supabase
      .from("user_collections")
      .upsert(
        { user_id: userId, card_id: cardId, ...holdingColumns(input) },
        { onConflict: "user_id,card_id" }
      );

    if (error) {
      console.error("Error adding card to collection:", error);
      throw error;
    }
  },

  /** Update either bucket. Fields left undefined are not touched. */
  async updateCard(
    userId: string,
    cardId: string,
    holding: HoldingInput | number,
    location?: string
  ): Promise<void> {
    const input: HoldingInput =
      typeof holding === "number" ? { quantity: holding, location } : holding;

    const { error } = await supabase
      .from("user_collections")
      .update(holdingColumns(input))
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
