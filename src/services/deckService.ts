import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import {
  asDeckSection,
  type DeckListEntry,
  type DeckSection,
} from "@/lib/deckList";
import { chunk, looseKey, pickPrinting, referencesToken } from "@/lib/deckImport";
import { sectionForCard } from "@/lib/deckRules";

export type Deck = Tables<"decks">;
export type DeckCard = Tables<"deck_cards">;

/** A deck card with the printing it points at, as every deck view needs both. */
export interface DeckCardWithCard extends Omit<DeckCard, "section"> {
  section: DeckSection;
  /** Whether this row asks for foil copies. Part of the row's identity. */
  foil: boolean;
  cards: Tables<"cards"> & { sets: Tables<"sets"> | null };
}

export interface DeckWithCards extends Deck {
  deck_cards: DeckCardWithCard[];
}

/** The chosen art, embedded on the deck list so tiles need no second query. */
export interface DeckCover {
  id: string;
  name: string;
  image_url: string | null;
}

export interface DeckSummary extends Deck {
  cover: DeckCover | null;
}

/** One printing offered as deck art. */
export interface ArtOption {
  id: string;
  name: string;
  image_url: string;
  card_number: string;
  /** Used to order tokens by element, the same as any other card. */
  element: string | null;
  set_code: string | null;
  set_name: string | null;
}

export interface ArtGroup {
  name: string;
  /** Token groups are separated because tokens are never in the deck itself. */
  kind: "deck" | "token";
  options: ArtOption[];
}

export interface ImportResult {
  /** Distinct printings written. */
  matched: number;
  /** Total copies written. */
  copies: number;
  /** Names with no printing in the catalog, in the order they were listed. */
  unmatched: string[];
}

// Columns needed to pick between printings and render them. Kept as one string
// literal: concatenating it defeats supabase-js's type inference.
// The costs and types are here because the section a card goes to is derived from
// them, not asked for: a memory cost means a material deck card, a reserve cost a
// main deck card.
const PRINTING_PICK_COLUMNS =
  "id, name, card_number, image_url, rarity, types, cost_memory, cost_reserve, set_id, sets(code, name, rank)";

/** Shape returned by PRINTING_PICK_COLUMNS. */
interface PrintingRow {
  id: string;
  name: string;
  card_number: string;
  image_url: string | null;
  rarity: string;
  types: string[];
  cost_memory: number | null;
  cost_reserve: number | null;
  set_id: string;
  sets: { code: string; name: string; rank: number } | null;
}

/**
 * Every printing of each named card, keyed by a loose form of the name.
 *
 * Exact matching happens in Postgres. Names it misses are retried one at a
 * time with ilike, which catches the case differences that come from hand-
 * typed lists without risking a wrong match the way a wildcard would.
 */
async function findPrintingsByNames(names: string[]): Promise<Map<string, PrintingRow[]>> {
  const byName = new Map<string, PrintingRow[]>();

  const add = (rows: PrintingRow[]) => {
    for (const row of rows) {
      const key = looseKey(row.name);
      const list = byName.get(key);
      if (list) list.push(row);
      else byName.set(key, [row]);
    }
  };

  for (const group of chunk(names, 40)) {
    const { data, error } = await supabase
      .from("cards")
      .select(PRINTING_PICK_COLUMNS)
      .in("name", group);
    if (error) throw error;
    add((data ?? []) as unknown as PrintingRow[]);
  }

  const missing = names.filter((name) => !byName.has(looseKey(name)));
  // Capped so a list of nonsense cannot fan out into hundreds of requests.
  for (const group of chunk(missing.slice(0, 40), 8)) {
    const results = await Promise.all(
      group.map((name) =>
        supabase.from("cards").select(PRINTING_PICK_COLUMNS).ilike("name", name)
      )
    );
    for (const { data, error } of results) {
      if (error) throw error;
      add((data ?? []) as unknown as PrintingRow[]);
    }
  }

  return byName;
}

/** Printings the user holds anywhere — any bucket, any location. */
async function ownedCardIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_collections")
    .select("card_id")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.card_id));
}

export const deckService = {
  /**
   * The deck list screen. The cover printing is embedded rather than fetched
   * per tile, and the foreign key is named explicitly because decks has more
   * than one path to cards once the cover column exists.
   */
  async getUserDecks(userId: string): Promise<DeckSummary[]> {
    const { data, error } = await supabase
      .from("decks")
      .select("*, cover:cards!decks_cover_card_id_fkey(id, name, image_url)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as unknown as DeckSummary[];
  },

  async getDeckById(deckId: string): Promise<DeckWithCards> {
    const { data, error } = await supabase
      .from("decks")
      .select(
        `
        *,
        deck_cards(
          *,
          cards(
            *,
            sets(*)
          )
        )
      `
      )
      .eq("id", deckId)
      .single();

    if (error) throw error;

    // section is a plain text column in Postgres, so narrow it once here rather
    // than defending against unknown strings at every call site.
    const deck = data as unknown as DeckWithCards;
    deck.deck_cards = (deck.deck_cards ?? []).map((row) => ({
      ...row,
      section: asDeckSection(row.section),
    }));
    return deck;
  },

  async createDeck(userId: string, name: string, description?: string): Promise<Deck> {
    const payload: TablesInsert<"decks"> = {
      user_id: userId,
      name,
      description: description || null,
    };

    const { data, error } = await supabase.from("decks").insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async updateDeck(
    deckId: string,
    updates: { name?: string; description?: string | null }
  ): Promise<Deck> {
    const payload: TablesUpdate<"decks"> = updates;
    const { data, error } = await supabase
      .from("decks")
      .update(payload)
      .eq("id", deckId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteDeck(deckId: string): Promise<void> {
    const { error } = await supabase.from("decks").delete().eq("id", deckId);
    if (error) throw error;
  },

  /** Pass null to fall back to the placeholder on the deck list. */
  async setCoverCard(deckId: string, cardId: string | null): Promise<void> {
    const payload: TablesUpdate<"decks"> = { cover_card_id: cardId };
    const { error } = await supabase.from("decks").update(payload).eq("id", deckId);
    if (error) throw error;
  },

  /**
   * Add copies, or raise the count if the printing is already in that section.
   * The same printing in the main deck and the sideboard are separate rows, so
   * the conflict target has to include the section.
   */
  async addCardToDeck(
    deckId: string,
    cardId: string,
    quantity: number,
    section: DeckSection = "main",
    foil = false
  ): Promise<void> {
    const { data: existing, error: readError } = await supabase
      .from("deck_cards")
      .select("id, quantity")
      .eq("deck_id", deckId)
      .eq("card_id", cardId)
      .eq("section", section)
      .eq("foil", foil)
      .maybeSingle();

    if (readError) throw readError;

    if (existing) {
      await this.updateDeckCard(deckId, cardId, existing.quantity + quantity, section, foil);
      return;
    }

    const payload: TablesInsert<"deck_cards"> = {
      deck_id: deckId,
      card_id: cardId,
      quantity,
      section,
      foil,
    };
    const { error } = await supabase.from("deck_cards").insert(payload);
    if (error) throw error;

    await this.touch(deckId);
  },

  async updateDeckCard(
    deckId: string,
    cardId: string,
    quantity: number,
    section: DeckSection = "main",
    foil = false
  ): Promise<void> {
    if (quantity <= 0) {
      return this.removeCardFromDeck(deckId, cardId, section, foil);
    }

    const payload: TablesUpdate<"deck_cards"> = { quantity };
    const { error } = await supabase
      .from("deck_cards")
      .update(payload)
      .eq("deck_id", deckId)
      .eq("card_id", cardId)
      .eq("section", section)
      .eq("foil", foil);

    if (error) throw error;
    await this.touch(deckId);
  },

  async removeCardFromDeck(
    deckId: string,
    cardId: string,
    section: DeckSection = "main",
    foil = false
  ): Promise<void> {
    const { error } = await supabase
      .from("deck_cards")
      .delete()
      .eq("deck_id", deckId)
      .eq("card_id", cardId)
      .eq("section", section)
      .eq("foil", foil);

    if (error) throw error;
    await this.touch(deckId);
  },

  /**
   * Move some copies between the main deck and the sideboard.
   *
   * Partial by design — swapping two of four copies into the sideboard is a
   * normal thing to do. Written as remove-then-add rather than an update of the
   * section, because the destination may already hold that printing, in which
   * case the rows have to merge instead of colliding with the unique index.
   */
  async moveCopies(
    deckId: string,
    cardId: string,
    from: DeckSection,
    to: DeckSection,
    copies: number,
    heldInFrom: number,
    foil = false
  ): Promise<void> {
    if (from === to || copies < 1) return;

    const moving = Math.min(copies, heldInFrom);
    if (moving >= heldInFrom) {
      await this.removeCardFromDeck(deckId, cardId, from, foil);
    } else {
      await this.updateDeckCard(deckId, cardId, heldInFrom - moving, from, foil);
    }

    await this.addCardToDeck(deckId, cardId, moving, to, foil);
  },

  /**
   * Swap one printing of a card for another — a different art of the same card,
   * keeping the deck's count.
   *
   * Merges rather than colliding if the deck already holds the target printing
   * in that section, which is what happens when someone consolidates two arts
   * back into one.
   */
  async swapPrinting(
    deckId: string,
    section: DeckSection,
    fromCardId: string,
    toCardId: string,
    foil = false
  ): Promise<void> {
    if (fromCardId === toCardId) return;

    const { data: existing, error } = await supabase
      .from("deck_cards")
      .select("quantity")
      .eq("deck_id", deckId)
      .eq("card_id", fromCardId)
      .eq("section", section)
      .eq("foil", foil)
      .maybeSingle();

    if (error) throw error;
    if (!existing) return;

    await this.removeCardFromDeck(deckId, fromCardId, section, foil);
    await this.addCardToDeck(deckId, toCardId, existing.quantity, section, foil);

    // The old printing may have been the deck's art. Point it at the new one
    // rather than leaving the deck showing a card it no longer contains.
    const { data: deck } = await supabase
      .from("decks")
      .select("cover_card_id")
      .eq("id", deckId)
      .maybeSingle();

    if (deck?.cover_card_id === fromCardId) {
      await this.setCoverCard(deckId, toCardId);
    }
  },

  /**
   * Change a row's finish, keeping the printing and the count.
   *
   * Merges rather than colliding if the deck already holds that printing in that
   * section in the target finish — asking for foil when a foil row already exists
   * means one row with both counts, not a unique-index violation.
   */
  async setDeckCardFoil(
    deckId: string,
    cardId: string,
    section: DeckSection,
    fromFoil: boolean,
    toFoil: boolean
  ): Promise<void> {
    if (fromFoil === toFoil) return;

    const { data: existing, error } = await supabase
      .from("deck_cards")
      .select("quantity")
      .eq("deck_id", deckId)
      .eq("card_id", cardId)
      .eq("section", section)
      .eq("foil", fromFoil)
      .maybeSingle();

    if (error) throw error;
    if (!existing) return;

    await this.removeCardFromDeck(deckId, cardId, section, fromFoil);
    await this.addCardToDeck(deckId, cardId, existing.quantity, section, toFoil);
  },

  /** Every printing of one card, for the per-card art picker. */
  async printingsForCardName(name: string): Promise<ArtOption[]> {
    return this.printingsForNames([name]);
  },

  /**
   * Resolve pasted names to printings and write them.
   *
   * `replace` is the right default for pasting a whole list: the text is the
   * deck. Adding instead is for pulling a sideboard or a second list into an
   * existing deck.
   */
  async importDeckList(
    deckId: string,
    userId: string,
    entries: DeckListEntry[],
    options: { replace: boolean }
  ): Promise<ImportResult> {
    const names = [...new Set(entries.map((entry) => entry.name))];
    if (names.length === 0) {
      return { matched: 0, copies: 0, unmatched: [] };
    }

    const [byName, owned] = await Promise.all([
      findPrintingsByNames(names),
      ownedCardIds(userId),
    ]);

    // Merge duplicate lines — a list can name the same card twice in one
    // section — before resolving, so the unique index is never the thing that
    // reports it.
    const wanted = new Map<string, { card_id: string; quantity: number; section: DeckSection }>();
    const unmatched: string[] = [];

    for (const entry of entries) {
      const candidates = byName.get(looseKey(entry.name));
      const printing = candidates ? pickPrinting(candidates, entry, owned) : null;

      if (!printing) {
        if (!unmatched.includes(entry.name)) unmatched.push(entry.name);
        continue;
      }

      // The heading is a hint, not the answer: a champion or regalia is a
      // material deck card wherever the list happened to put it.
      const section = sectionForCard(printing, entry.section);

      const key = `${printing.id}:${section}`;
      const already = wanted.get(key);
      if (already) {
        already.quantity += entry.quantity;
      } else {
        wanted.set(key, {
          card_id: printing.id,
          quantity: entry.quantity,
          section,
        });
      }
    }

    const rows: TablesInsert<"deck_cards">[] = [...wanted.values()].map((row) => ({
      deck_id: deckId,
      card_id: row.card_id,
      quantity: row.quantity,
      section: row.section,
    }));

    if (options.replace) {
      const { error } = await supabase.from("deck_cards").delete().eq("deck_id", deckId);
      if (error) throw error;
    }

    if (rows.length) {
      // onConflict covers the add path, where the printing may already be in
      // that section; the pasted quantity wins.
      const { error } = await supabase
        .from("deck_cards")
        .upsert(rows, { onConflict: "deck_id,card_id,section,foil" });
      if (error) throw error;
    }

    await this.ensureCover(deckId);
    await this.touch(deckId);

    return {
      matched: rows.length,
      copies: rows.reduce((total, row) => total + (row.quantity ?? 0), 0),
      unmatched,
    };
  },

  /**
   * Art to choose between: every printing of every card in the deck, plus the
   * tokens the deck makes.
   *
   * Tokens are in the catalog but never in a deck list, so they are found by
   * looking for "<name> token" in the effect text of the deck's own cards —
   * the phrasing the card text actually uses ("summon a Spirit Shard token").
   */
  async getArtOptions(deckId: string): Promise<ArtGroup[]> {
    const { data: deckCards, error } = await supabase
      .from("deck_cards")
      .select("card_id, cards(name, effect_text)")
      .eq("deck_id", deckId);

    if (error) throw error;

    const rows = (deckCards ?? []) as unknown as Array<{
      card_id: string;
      cards: { name: string; effect_text: string | null } | null;
    }>;

    const names = [...new Set(rows.map((row) => row.cards?.name).filter(Boolean) as string[])];
    if (names.length === 0) return [];

    const effectText = rows
      .map((row) => row.cards?.effect_text ?? "")
      .join("\n")
      .toLowerCase();

    const [deckPrintings, tokenPrintings] = await Promise.all([
      this.printingsForNames(names),
      this.tokenPrintings(),
    ]);

    const groups: ArtGroup[] = [];

    const groupBy = (printings: ArtOption[], kind: ArtGroup["kind"]) => {
      const byCard = new Map<string, ArtOption[]>();
      for (const option of printings) {
        const list = byCard.get(option.name);
        if (list) list.push(option);
        else byCard.set(option.name, [option]);
      }
      for (const name of [...byCard.keys()].sort((a, b) => a.localeCompare(b))) {
        groups.push({ name, kind, options: byCard.get(name)! });
      }
    };

    groupBy(deckPrintings, "deck");

    const referenced = tokenPrintings.filter((option) =>
      referencesToken(effectText, option.name)
    );
    groupBy(referenced, "token");

    return groups;
  },

  /** Every printing with art for the given card names. */
  async printingsForNames(names: string[]): Promise<ArtOption[]> {
    const out: ArtOption[] = [];

    for (const group of chunk(names, 40)) {
      const { data, error } = await supabase
        .from("cards")
        .select("id, name, card_number, image_url, element, sets(code, name)")
        .in("name", group)
        .not("image_url", "is", null)
        .order("name");

      if (error) throw error;
      out.push(...toArtOptions(data));
    }

    return out;
  },

  /**
   * Every token printing in the catalog. There are only a few dozen tokens, so
   * this is one small query rather than a filter per deck card.
   */
  async tokenPrintings(): Promise<ArtOption[]> {
    const { data, error } = await supabase
      .from("cards")
      .select("id, name, card_number, image_url, element, sets(code, name)")
      .contains("types", ["TOKEN"])
      .not("image_url", "is", null)
      .order("name");

    if (error) throw error;
    return toArtOptions(data);
  },

  /**
   * Give a deck art if it has none, so an imported deck shows something on the
   * deck list without the owner having to pick. The material deck leads with
   * the champion, which is the card people recognise the deck by.
   */
  async ensureCover(deckId: string): Promise<void> {
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("cover_card_id")
      .eq("id", deckId)
      .single();

    if (deckError) throw deckError;
    if (deck?.cover_card_id) return;

    const { data, error } = await supabase
      .from("deck_cards")
      .select("card_id, section, cards(image_url)")
      .eq("deck_id", deckId);

    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
      card_id: string;
      section: string;
      cards: { image_url: string | null } | null;
    }>;

    const withArt = rows.filter((row) => row.cards?.image_url);
    const first =
      withArt.find((row) => asDeckSection(row.section) === "material") ??
      withArt.find((row) => asDeckSection(row.section) === "main") ??
      withArt[0];

    if (first) await this.setCoverCard(deckId, first.card_id);
  },

  /**
   * deck_cards changes do not touch the deck row, so the "last updated" the
   * deck list sorts by would stand still while the deck was being built. The
   * decks_set_updated_at trigger overwrites the value; sending it is just what
   * makes the UPDATE happen.
   */
  async touch(deckId: string): Promise<void> {
    const payload: TablesUpdate<"decks"> = { updated_at: new Date().toISOString() };
    const { error } = await supabase.from("decks").update(payload).eq("id", deckId);
    if (error) throw error;
  },
};

/** Rows with art, flattened into the shape the picker renders. */
function toArtOptions(
  data:
    | Array<{
        id: string;
        name: string;
        card_number: string;
        image_url: string | null;
        element: string | null;
        sets: { code: string; name: string } | null;
      }>
    | null
): ArtOption[] {
  return (data ?? [])
    .filter((row) => !!row.image_url)
    .map((row) => ({
      id: row.id,
      name: row.name,
      image_url: row.image_url as string,
      card_number: row.card_number,
      element: row.element,
      set_code: row.sets?.code ?? null,
      set_name: row.sets?.name ?? null,
    }));
}
