import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Deck = Tables<"decks">;
export type DeckCard = Tables<"deck_cards">;

export interface DeckWithCards extends Deck {
  deck_cards: Array<
    DeckCard & {
      cards: Tables<"cards"> & {
        sets: Tables<"sets"> | null;
      };
    }
  >;
}

export const deckService = {
  async getUserDecks(userId: string) {
    const { data, error } = await supabase
      .from("decks")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    console.log("getUserDecks:", { data, error });
    if (error) throw error;
    return data || [];
  },

  async getDeckById(deckId: string) {
    const { data, error } = await supabase
      .from("decks")
      .select(`
        *,
        deck_cards(
          *,
          cards(
            *,
            sets(*)
          )
        )
      `)
      .eq("id", deckId)
      .single();

    console.log("getDeckById:", { data, error });
    if (error) throw error;
    return data as DeckWithCards;
  },

  async createDeck(userId: string, name: string, description?: string) {
    const { data, error } = await supabase
      .from("decks")
      .insert({
        user_id: userId,
        name,
        description: description || null,
      })
      .select()
      .single();

    console.log("createDeck:", { data, error });
    if (error) throw error;
    return data;
  },

  async updateDeck(deckId: string, updates: { name?: string; description?: string }) {
    const { data, error } = await supabase
      .from("decks")
      .update(updates)
      .eq("id", deckId)
      .select()
      .single();

    console.log("updateDeck:", { data, error });
    if (error) throw error;
    return data;
  },

  async deleteDeck(deckId: string) {
    const { error } = await supabase
      .from("decks")
      .delete()
      .eq("id", deckId);

    console.log("deleteDeck:", { error });
    if (error) throw error;
  },

  async addCardToDeck(deckId: string, cardId: string, quantity: number) {
    const { data, error } = await supabase
      .from("deck_cards")
      .upsert({
        deck_id: deckId,
        card_id: cardId,
        quantity,
      })
      .select()
      .single();

    console.log("addCardToDeck:", { data, error });
    if (error) throw error;
    return data;
  },

  async removeCardFromDeck(deckId: string, cardId: string) {
    const { error } = await supabase
      .from("deck_cards")
      .delete()
      .eq("deck_id", deckId)
      .eq("card_id", cardId);

    console.log("removeCardFromDeck:", { error });
    if (error) throw error;
  },

  async updateDeckCard(deckId: string, cardId: string, quantity: number) {
    if (quantity === 0) {
      return this.removeCardFromDeck(deckId, cardId);
    }

    const { data, error } = await supabase
      .from("deck_cards")
      .update({ quantity })
      .eq("deck_id", deckId)
      .eq("card_id", cardId)
      .select()
      .single();

    console.log("updateDeckCard:", { data, error });
    if (error) throw error;
    return data;
  },
};