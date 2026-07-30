import { supabase } from "@/integrations/supabase/client";
import type { Tables, ViewRows } from "@/integrations/supabase/types";

export type Card = Tables<"cards">;
export type Set = Tables<"sets">;
export type UserCollection = Tables<"user_collections">;

/** One row per card name — see public.card_catalog. */
export type CatalogCard = ViewRows<"card_catalog">;

/**
 * cards.rarity holds these codes, matching the API's numeric rarity 1-9. The
 * deck builder previously offered display names ("Common", "Super Rare") and
 * compared them with eq(), which could never match a code.
 */
export const RARITY_LABELS: Record<string, string> = {
  C: "Common",
  U: "Uncommon",
  R: "Rare",
  SR: "Super Rare",
  UR: "Ultra Rare",
  PR: "Promotional Rare",
  CSR: "Collector Super Rare",
  CUR: "Collector Ultra Rare",
  CPR: "Collector Promo Rare",
};

/** A distinct element/type/subtype/class value with its card count. */
export type FilterOption = { value: string; count: number };

export type FilterOptions = {
  elements: FilterOption[];
  types: FilterOption[];
  subtypes: FilterOption[];
  classes: FilterOption[];
};

export type CardFilters = {
  /** Card name, substring match. */
  search?: string;
  /** Effect text, substring match — "ban" matches "Banish". */
  effectSearch?: string;
  elements?: string[];
  /** Set codes. Matches cards with any printing in these sets. */
  setCodes?: string[];
  types?: string[];
  subtypes?: string[];
  classes?: string[];
  costMemoryMin?: number | null;
  costMemoryMax?: number | null;
  costReserveMin?: number | null;
  costReserveMax?: number | null;
};

export const EMPTY_FILTERS: CardFilters = {
  search: "",
  effectSearch: "",
  elements: [],
  setCodes: [],
  types: [],
  subtypes: [],
  classes: [],
  costMemoryMin: null,
  costMemoryMax: null,
  costReserveMin: null,
  costReserveMax: null,
};

export const countActiveFilters = (filters: CardFilters): number =>
  (filters.elements?.length ? 1 : 0) +
  (filters.setCodes?.length ? 1 : 0) +
  (filters.types?.length ? 1 : 0) +
  (filters.subtypes?.length ? 1 : 0) +
  (filters.classes?.length ? 1 : 0) +
  (filters.effectSearch?.trim() ? 1 : 0) +
  (filters.costMemoryMin != null || filters.costMemoryMax != null ? 1 : 0) +
  (filters.costReserveMin != null || filters.costReserveMax != null ? 1 : 0);

// Only the columns the grid actually renders. effect_text and flavor_text are
// the bulk of a row and are not shown on a tile, so they are fetched later by
// getPrintingsForName when a card's dialog opens.
//
// Kept as one literal: supabase-js infers the result type by parsing this
// string, and concatenation defeats that, degrading the row type to an error
// placeholder.
// Printing-level columns for the deck builder's picker. A deck references a
// specific printing (deck_cards.card_id -> cards.id), so it cannot use the
// name-collapsed catalog view. Narrow because the picker renders only art and a
// name — plus types, which decides whether a card is a material deck card.
const PRINTING_COLUMNS =
  "id, name, card_number, element, card_type, class, types, rarity, cost, power, life, speed, image_url, is_restricted, set_id, sets(id, code, name, rank)" as const;

const CATALOG_COLUMNS =
  "id, name, set_id, card_number, element, card_type, class, rarity, cost, power, life, speed, image_url, illustrator, is_restricted, set_code, set_name, set_rank, printing_count" as const;

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

    
    if (error) throw error;
    return data || [];
  },

  /**
   * One page of the browse grid, ordered and de-duplicated by Postgres.
   *
   * The previous approach called getCards() with no arguments, which loops
   * until it has every printing — ~3.6 MB of JSON across five round trips —
   * then grouped, sorted and sliced it in the browser. Because the effect that
   * called it keyed on both page and search text, that ran again on every page
   * click and every keystroke.
   *
   * public.card_catalog already collapses printings to one row per name using
   * sets.rank, so a base expansion represents a card instead of a promo.
   */
  async getCatalogPage(options: {
    page: number;
    pageSize: number;
    filters?: CardFilters;
  }) {
    const from = (options.page - 1) * options.pageSize;
    const f = options.filters ?? {};

    let query = supabase
      .from("card_catalog")
      .select(CATALOG_COLUMNS, { count: "exact" })
      .order("name", { ascending: true })
      .range(from, from + options.pageSize - 1);

    const search = f.search?.trim();
    if (search) query = query.ilike("name", `%${search}%`);

    const effect = f.effectSearch?.trim();
    if (effect) query = query.ilike("effect_text", `%${effect}%`);

    // element is single-valued, so membership rather than overlap.
    if (f.elements?.length) query = query.in("element", f.elements);

    // The array filters are OR within a control and AND across controls: picking
    // FIRE + WATER widens, adding a class narrows.
    if (f.types?.length) query = query.overlaps("types", f.types);
    if (f.subtypes?.length) query = query.overlaps("subtypes", f.subtypes);
    if (f.classes?.length) query = query.overlaps("classes", f.classes);

    // set_codes holds every set a card appears in, so this means "available in
    // these sets" — the tile still shows the best-ranked printing's art.
    if (f.setCodes?.length) query = query.overlaps("set_codes", f.setCodes);

    if (f.costMemoryMin != null) query = query.gte("cost_memory", f.costMemoryMin);
    if (f.costMemoryMax != null) query = query.lte("cost_memory", f.costMemoryMax);
    if (f.costReserveMin != null) query = query.gte("cost_reserve", f.costReserveMin);
    if (f.costReserveMax != null) query = query.lte("cost_reserve", f.costReserveMax);

    const { data, error, count } = await query;
    if (error) throw error;

    return { rows: (data ?? []) as CatalogCard[], total: count ?? 0 };
  },

  /**
   * Every dropdown's options in one request, with card counts, from
   * public.card_filter_options. Sets come from getAllSets separately because
   * they carry a name and rank the filter list wants to show.
   */
  async getFilterOptions(): Promise<FilterOptions> {
    const { data, error } = await supabase
      .from("card_filter_options")
      .select("kind, value, card_count");

    if (error) throw error;

    const buckets: FilterOptions = { elements: [], types: [], subtypes: [], classes: [] };
    const target = {
      element: buckets.elements,
      type: buckets.types,
      subtype: buckets.subtypes,
      class: buckets.classes,
    } as const;

    for (const row of data ?? []) {
      const bucket = target[row.kind as keyof typeof target];
      if (!bucket || !row.value) continue;
      bucket.push({ value: row.value, count: row.card_count ?? 0 });
    }

    // Alphabetical: these lists are browsed, not ranked, and 146 subtypes need a
    // predictable order to scan.
    for (const bucket of Object.values(buckets)) {
      bucket.sort((a, b) => a.value.localeCompare(b.value));
    }

    return buckets;
  },

  /**
   * One page of printings, for the deck builder's card picker.
   *
   * Replaces a getCards() call that looped until it had every matching printing
   * — the whole catalog when no filter was set — and re-ran on every keystroke.
   *
   * Filters are printing-level on purpose: a deck holds a specific printing, so
   * set and rarity have to mean the printing's set and rarity, not the
   * representative one the catalog view picks.
   */
  async getCardsPage(options: {
    page: number;
    pageSize: number;
    search?: string;
    setId?: string;
    rarity?: string;
    /** A single value from cards.types, e.g. "ALLY". */
    type?: string;
  }) {
    const from = (options.page - 1) * options.pageSize;

    let query = supabase
      .from("cards")
      .select(PRINTING_COLUMNS, { count: "exact" })
      .order("name", { ascending: true })
      .order("card_number", { ascending: true })
      .range(from, from + options.pageSize - 1);

    const search = options.search?.trim();
    if (search) query = query.ilike("name", `%${search}%`);
    if (options.setId) query = query.eq("set_id", options.setId);

    // rarity holds codes (C, U, R, SR, UR, PR, CSR, CUR, CPR), not display names.
    if (options.rarity) query = query.eq("rarity", options.rarity);

    // types is an array, so overlap rather than equality against card_type —
    // card_type is a display string like "ALLY — HUMAN WARRIOR" and never equals
    // a bare type name.
    if (options.type) query = query.overlaps("types", [options.type]);

    const { data, error, count } = await query;
    if (error) throw error;

    return { rows: (data ?? []) as CardWithSet[], total: count ?? 0 };
  },

  /**
   * Every printing of one card, best first — same precedence as the view.
   *
   * PostgREST cannot reliably order on an embedded table's column, and a card
   * has only a handful of printings, so the ranking is applied here rather than
   * in the query.
   */
  async getPrintingsForName(name: string) {
    const { data, error } = await supabase
      .from("cards")
      .select("*, sets(*)")
      .eq("name", name);

    if (error) throw error;

    return ((data ?? []) as CardWithSet[]).slice().sort((a, b) => {
      const byImage = Number(!a.image_url) - Number(!b.image_url);
      if (byImage !== 0) return byImage;

      const byRank = (a.sets?.rank ?? 99) - (b.sets?.rank ?? 99);
      if (byRank !== 0) return byRank;

      const bySet = (a.sets?.name ?? "").localeCompare(b.sets?.name ?? "");
      if (bySet !== 0) return bySet;

      return (a.card_number ?? "").localeCompare(b.card_number ?? "");
    });
  },

  async getCardById(cardId: string) {
    const { data, error } = await supabase
      .from("cards")
      .select("*, sets(*)")
      .eq("id", cardId)
      .single();

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
        user_collections!inner(user_id, bucket, location, quantity)
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

      if (error) throw error;
      return;
    }

    // Copies are held per place now, so a plain total needs a place to sit in;
    // the personal bucket with no location is the neutral default.
    const { data, error } = await supabase
      .from("user_collections")
      .upsert(
        {
          user_id: userId,
          card_id: cardId,
          bucket: "personal",
          location: location ?? "",
          quantity,
        },
        { onConflict: "user_id,card_id,bucket,location" }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getCollectionStats(userId: string) {
    const { data, error } = await supabase
      .from("user_collections")
      .select("card_id, quantity")
      .eq("user_id", userId);

    if (error) throw error;

    const rows = data || [];
    const totalCards = rows.reduce((sum, item) => sum + (item.quantity || 0), 0);
    // Distinct cards, not rows: one card can sit in several places now.
    const uniqueCards = new Set(rows.map((item) => item.card_id)).size;

    return { totalCards, uniqueCards };
  },
};
