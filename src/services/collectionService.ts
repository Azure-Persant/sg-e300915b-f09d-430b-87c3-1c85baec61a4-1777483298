import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Card } from "./cardService";

export type CollectionBucket = "personal" | "sale" | "loaned";

export const BUCKETS: CollectionBucket[] = ["personal", "sale", "loaned"];

export const BUCKET_LABELS: Record<CollectionBucket, string> = {
  personal: "Personal",
  sale: "For sale / trade",
  loaned: "Lent out",
};

/**
 * One place a card is held. A card has as many of these as it has places:
 * 1 in Box 1, 4 in Box 2, 2 in Alice's deck.
 */
export interface Holding {
  id: string;
  user_id: string;
  card_id: string;
  bucket: CollectionBucket;
  /** Where the copies are, or for a loan who holds them. "" means unspecified. */
  location: string;
  /** Always above 0 — the row is deleted rather than zeroed. */
  quantity: number;
  loaned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
  card?: Card;
}

/** A place as the editor holds it, before it becomes a row. */
export interface PlaceInput {
  bucket: CollectionBucket;
  location: string;
  quantity: number;
  loanedToUserId?: string | null;
}

export interface CollectionStats {
  /** Distinct printings held, counting a card once however many places it sits in. */
  uniqueCards: number;
  totalQuantity: number;
  personalQuantity: number;
  forSaleQuantity: number;
  forSaleCards: number;
  loanedQuantity: number;
  loanedCards: number;
  /** Distinct place names in use, for the location suggestions. */
  locations: string[];
}

const HOLDING_COLUMNS =
  "id, user_id, card_id, bucket, location, quantity, loaned_to_user_id, created_at, updated_at";

/** Blank locations are stored as "", never null, so the unique index can use them. */
const normaliseLocation = (location: string | null | undefined): string =>
  (location ?? "").trim();

export const collectionService = {
  /** Every place the user holds a card, with the card joined. */
  async getHoldings(userId: string): Promise<Holding[]> {
    const { data, error } = await supabase
      .from("user_collections")
      .select(`${HOLDING_COLUMNS}, card:cards(*)`)
      .eq("user_id", userId)
      .order("bucket")
      .order("location");

    if (error) {
      console.error("Error fetching collection:", error);
      throw error;
    }

    return (data ?? []).map((row) => ({
      ...row,
      bucket: row.bucket as CollectionBucket,
      card: row.card as Card,
    })) as Holding[];
  },

  /** Kept for callers that still say getCollection. */
  async getCollection(userId: string): Promise<Holding[]> {
    return this.getHoldings(userId);
  },

  async getCollectionStats(userId: string): Promise<CollectionStats> {
    const { data, error } = await supabase
      .from("user_collections")
      .select("card_id, bucket, location, quantity")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching collection stats:", error);
      throw error;
    }

    const rows = data ?? [];
    const sum = (bucket: CollectionBucket) =>
      rows.filter((r) => r.bucket === bucket).reduce((total, r) => total + r.quantity, 0);
    const cards = (bucket: CollectionBucket) =>
      new Set(rows.filter((r) => r.bucket === bucket).map((r) => r.card_id)).size;

    return {
      uniqueCards: new Set(rows.map((r) => r.card_id)).size,
      totalQuantity: rows.reduce((total, r) => total + r.quantity, 0),
      personalQuantity: sum("personal"),
      forSaleQuantity: sum("sale"),
      forSaleCards: cards("sale"),
      loanedQuantity: sum("loaned"),
      loanedCards: cards("loaned"),
      locations: Array.from(
        new Set(rows.map((r) => r.location).filter((l) => l !== ""))
      ).sort((a, b) => a.localeCompare(b)),
    };
  },

  /**
   * Replace every place for one card with exactly `places`.
   *
   * Written before deleting, so a failure part-way leaves extra rows rather than
   * losing copies. Places with quantity 0 are simply absent from the input, which
   * is how a place is removed — the table rejects a row with 0 copies.
   */
  async setCardHoldings(userId: string, cardId: string, places: PlaceInput[]): Promise<void> {
    const wanted = places
      .map((place) => ({ ...place, location: normaliseLocation(place.location) }))
      .filter((place) => place.quantity > 0);

    const unnamedLoan = wanted.find((p) => p.bucket === "loaned" && p.location === "");
    if (unnamedLoan) {
      // The database enforces this too; failing here gives a better message.
      throw new Error("A loan has to say who is holding the cards.");
    }

    // Two places with the same name in the same bucket are one place.
    const merged = new Map<string, PlaceInput>();
    for (const place of wanted) {
      const key = `${place.bucket}|${place.location}`;
      const existing = merged.get(key);
      merged.set(
        key,
        existing ? { ...existing, quantity: existing.quantity + place.quantity } : place
      );
    }

    const { data: current, error: readError } = await supabase
      .from("user_collections")
      .select("id, bucket, location")
      .eq("user_id", userId)
      .eq("card_id", cardId);

    if (readError) throw readError;

    if (merged.size > 0) {
      const { error: writeError } = await supabase.from("user_collections").upsert(
        Array.from(merged.values()).map((place) => ({
          user_id: userId,
          card_id: cardId,
          bucket: place.bucket,
          location: place.location,
          quantity: place.quantity,
          loaned_to_user_id: place.loanedToUserId ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,card_id,bucket,location" }
      );

      if (writeError) throw writeError;
    }

    const staleIds = (current ?? [])
      .filter((row) => !merged.has(`${row.bucket}|${row.location}`))
      .map((row) => row.id);

    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("user_collections")
        .delete()
        .in("id", staleIds);

      if (deleteError) throw deleteError;
    }
  },

  /**
   * Add copies to one place, on top of whatever is already there.
   *
   * Used by the card browser, where "add 2" means two more rather than a new
   * total. Reads first because PostgREST cannot express quantity = quantity + n.
   */
  async addCopies(
    userId: string,
    cardId: string,
    bucket: CollectionBucket,
    location: string,
    quantity: number
  ): Promise<void> {
    if (quantity <= 0) return;
    const place = normaliseLocation(location);

    if (bucket === "loaned" && place === "") {
      throw new Error("A loan has to say who is holding the cards.");
    }

    const { data: existing, error: readError } = await supabase
      .from("user_collections")
      .select("quantity")
      .eq("user_id", userId)
      .eq("card_id", cardId)
      .eq("bucket", bucket)
      .eq("location", place)
      .maybeSingle();

    if (readError) throw readError;

    const { error } = await supabase.from("user_collections").upsert(
      {
        user_id: userId,
        card_id: cardId,
        bucket,
        location: place,
        quantity: (existing?.quantity ?? 0) + quantity,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,card_id,bucket,location" }
    );

    if (error) {
      console.error("Error adding card to collection:", error);
      throw error;
    }
  },

  /** Older name, kept so the card browser keeps working. */
  async addCard(
    userId: string,
    cardId: string,
    quantity: number,
    location?: string
  ): Promise<void> {
    return this.addCopies(userId, cardId, "personal", location ?? "", quantity);
  },

  /** Removes the card from the collection entirely, every place included. */
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

  /** Removes one place, leaving the card's other places alone. */
  async removeHolding(holdingId: string): Promise<void> {
    const { error } = await supabase.from("user_collections").delete().eq("id", holdingId);
    if (error) throw error;
  },

  /**
   * Copies of one printing, per bucket — what deck building asks to decide
   * whether a card is actually available to play.
   */
  async getCardOwnership(
    userId: string,
    cardId: string
  ): Promise<{ personal: number; sale: number; loaned: number; total: number }> {
    const { data, error } = await supabase
      .from("user_collections")
      .select("bucket, quantity")
      .eq("user_id", userId)
      .eq("card_id", cardId);

    if (error) {
      console.error("Error checking card ownership:", error);
      throw error;
    }

    const rows = data ?? [];
    const of = (bucket: CollectionBucket) =>
      rows.filter((r) => r.bucket === bucket).reduce((t, r) => t + r.quantity, 0);

    return {
      personal: of("personal"),
      sale: of("sale"),
      loaned: of("loaned"),
      total: rows.reduce((t, r) => t + r.quantity, 0),
    };
  },

  async bulkAddCards(
    userId: string,
    cards: Array<{ cardId: string; quantity: number; location?: string; bucket?: CollectionBucket }>
  ): Promise<void> {
    for (const card of cards) {
      await this.addCopies(
        userId,
        card.cardId,
        card.bucket ?? "personal",
        card.location ?? "",
        card.quantity
      );
    }
  },
};

// ------------------------------------------------------------------- sharing

export type CollectionShare = Tables<"collection_shares">;

/**
 * What a guest sees. No locations and no borrower names: those are the owner's
 * business, and a borrower did not agree to appear on a shared page. Quantities
 * are totals summed across every place the owner keeps the card.
 */
export interface SharedHolding {
  card_id: string;
  card_name: string;
  set_code: string | null;
  set_name: string | null;
  rarity: string;
  image_url: string | null;
  card_type: string;
  element: string | null;
  cost: number | null;
  power: number | null;
  life: number | null;
  speed: string | null;
  effect_text: string | null;
  personal_quantity: number;
  sale_quantity: number;
  loaned_quantity: number;
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
