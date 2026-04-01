/**
 * Service for interacting with the official Grand Archive TCG API
 * API Documentation: https://api.gatcg.com/swagger
 */

interface GATCGCard {
  name: string;
  slug: string;
  classes: string[];
  cost_memory: number | null;
  cost_reserve: number | null;
  rarity: string;
  types: string[];
  effect_text: string | null;
  effect_raw: string | null;
  flavor: string | null;
  illustrator: string | null;
  image: string;
  power: number | null;
  life: number | null;
  durability: number | null;
  editions: Array<{
    set: string;
    collector_number: string;
  }>;
}

const API_BASE_URL = "https://api.gatcg.com";

export const gatcgApiService = {
  /**
   * Fetch all cards (with pagination)
   */
  async getAllCards(page = 1, limit = 100): Promise<{ cards: GATCGCard[]; hasNext: boolean }> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/cards/search?page=${page}&limit=${limit}`
      );
      if (!response.ok) throw new Error("Failed to fetch cards");
      const data = await response.json();
      return {
        cards: data.data || [],
        hasNext: data.next || false,
      };
    } catch (error) {
      console.error("Error fetching cards:", error);
      return { cards: [], hasNext: false };
    }
  },

  /**
   * Search cards by name
   */
  async searchCards(query: string): Promise<GATCGCard[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/cards/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Failed to search cards");
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error("Error searching cards:", error);
      return [];
    }
  },
};