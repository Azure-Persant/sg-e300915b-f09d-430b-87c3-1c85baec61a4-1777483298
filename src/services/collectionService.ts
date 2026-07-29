import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
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

/**
 * Maps the camelCase input to columns, dropping keys the caller did not set.
 *
 * Typed as the generated Update row rather than Record<string, unknown>: newer
 * @supabase/supabase-js releases reject an index-signature object outright
 * ("Type 'unknown' is not assignable to type 'never'"), and the generated type
 * catches a mistyped column name here instead of at runtime.
 */
const holdingColumns = (holding: HoldingInput): TablesUpdate<"user_collections"> => {
  const row: TablesUpdate<"user_collections"> = { updated_at: new Date().toISOString() };
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
// ------------------------------------------------------------------- sharing

export type CollectionShare = Tables<"collection_shares">;

export interface SharedHolding {
  card_id: string;
  card_name: string;
  set_code: string | null;
  set_name: string | null;
  rarity: string;
  image_url: string | null;
  personal_quantity: number;
  personal_location: string | null;
  sale_quantity: number;
  sale_location: string | null;
  loaned_quantity: number;
  loaned_to: string | null;
}

export interface SharedCollectionMeta {
  owner_name: string;
  label: string | null;
  include_personal: boolean;
  include_sale: boolean;
  include_loaned: boolean;
  expires_at: string | null;
}

export interface ShareInput {
  label?: string | null;
  /** Null or empty creates an open link; an address restricts it to that person. */
  invitedEmail?: string | null;
  includePersonal: boolean;
  includeSale: boolean;
  includeLoaned: boolean;
  /** Null means no expiry. */
  expiresAt?: string | null;
}

/** Presets offered in the UI. Null is "no expiry", which is a valid choice. */
export const EXPIRY_PRESETS: Array<{ label: string; hours: number | null }> = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
  { label: "No expiry", hours: null },
];

export const expiryFromHours = (hours: number | null): string | null =>
  hours === null ? null : new Date(Date.now() + hours * 3600_000).toISOString();

export const isShareLive = (share: CollectionShare): boolean =>
  !share.revoked_at && (!share.expires_at || new Date(share.expires_at) > new Date());

export const shareUrl = (token: string): string =>
  typeof window === "undefined" ? `/shared/${token}` : `${window.location.origin}/shared/${token}`;

export const collectionShareService = {
  /** The owner's own shares, newest first. */
  async list(ownerId: string): Promise<CollectionShare[]> {
    const { data, error } = await supabase
      .from("collection_shares")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  /**
   * Create a share, or re-point an existing invite for the same address.
   *
   * The database holds one row per (owner, invited_email), so re-inviting
   * someone updates their share rather than failing or stacking duplicates.
   * Open links have a null email and are never merged — an owner may want
   * several with different scopes and expiries.
   */
  async create(ownerId: string, input: ShareInput): Promise<CollectionShare> {
    const email = input.invitedEmail?.trim().toLowerCase() || null;

    const row = {
      owner_id: ownerId,
      label: input.label?.trim() || null,
      invited_email: email,
      include_personal: input.includePersonal,
      include_sale: input.includeSale,
      include_loaned: input.includeLoaned,
      expires_at: input.expiresAt ?? null,
      // Re-inviting someone who was revoked should work rather than stay dead.
      revoked_at: null,
    };

    const { data, error } = email
      ? await supabase
          .from("collection_shares")
          .upsert(row, { onConflict: "owner_id,invited_email" })
          .select()
          .single()
      : await supabase.from("collection_shares").insert(row).select().single();

    if (error) throw error;
    return data;
  },

  /** Revoked rather than deleted, so the row remains as a record of the grant. */
  async revoke(shareId: string): Promise<void> {
    const { error } = await supabase
      .from("collection_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", shareId);

    if (error) throw error;
  },

  async remove(shareId: string): Promise<void> {
    const { error } = await supabase.from("collection_shares").delete().eq("id", shareId);
    if (error) throw error;
  },

  /**
   * Read a shared collection by token.
   *
   * Returns null when the token is unknown, revoked, expired, or restricted to
   * someone else — the database deliberately does not distinguish those, so a
   * viewer cannot probe for which tokens exist.
   */
  async read(token: string): Promise<{ meta: SharedCollectionMeta; holdings: SharedHolding[] } | null> {
    const [metaResult, holdingsResult] = await Promise.all([
      supabase.rpc("shared_collection_meta", { p_token: token }),
      supabase.rpc("shared_collection", { p_token: token }),
    ]);

    if (metaResult.error) throw metaResult.error;
    if (holdingsResult.error) throw holdingsResult.error;

    const meta = (metaResult.data ?? [])[0];
    if (!meta) return null;

    return { meta, holdings: holdingsResult.data ?? [] };
  },
};
