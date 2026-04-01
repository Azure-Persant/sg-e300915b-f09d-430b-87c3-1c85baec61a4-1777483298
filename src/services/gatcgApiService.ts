/**
 * Service for interacting with the official Grand Archive TCG API
 * API Documentation: https://api.gatcg.com/swagger
 */

interface GATCGCard {
  uuid: string;
  name: string;
  slug: string;
  edition: string;
  set: {
    name: string;
    prefix: string;
  };
  rarity: string;
  types: string[];
  subtypes: string[];
  element: string | null;
  cost: {
    memory?: number;
    reserve?: number;
  };
  power: number | null;
  life: number | null;
  effect_text: string;
  flavor_text: string | null;
  image_url: string;
  illustrator: string;
}

interface GATCGSet {
  name: string;
  prefix: string;
  slug: string;
  release_date: string;
}

const API_BASE_URL = "https://api.gatcg.com";

export const gatcgApiService = {
  /**
   * Fetch all available sets
   */
  async getSets(): Promise<GATCGSet[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/sets`);
      if (!response.ok) throw new Error("Failed to fetch sets");
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error("Error fetching sets:", error);
      return [];
    }
  },

  /**
   * Fetch all cards (with pagination)
   */
  async getAllCards(page = 1, perPage = 100): Promise<{ cards: GATCGCard[]; total: number }> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/cards?page=${page}&per_page=${perPage}`
      );
      if (!response.ok) throw new Error("Failed to fetch cards");
      const data = await response.json();
      return {
        cards: data.data || [],
        total: data.meta?.total || 0,
      };
    } catch (error) {
      console.error("Error fetching cards:", error);
      return { cards: [], total: 0 };
    }
  },

  /**
   * Fetch cards by set
   */
  async getCardsBySet(setSlug: string): Promise<GATCGCard[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/cards?set=${setSlug}`);
      if (!response.ok) throw new Error("Failed to fetch cards by set");
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error("Error fetching cards by set:", error);
      return [];
    }
  },

  /**
   * Fetch a single card by UUID
   */
  async getCard(uuid: string): Promise<GATCGCard | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/cards/${uuid}`);
      if (!response.ok) throw new Error("Failed to fetch card");
      const data = await response.json();
      return data.data || null;
    } catch (error) {
      console.error("Error fetching card:", error);
      return null;
    }
  },

  /**
   * Search cards by name
   */
  async searchCards(query: string): Promise<GATCGCard[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/cards?name=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Failed to search cards");
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error("Error searching cards:", error);
      return [];
    }
  },
};