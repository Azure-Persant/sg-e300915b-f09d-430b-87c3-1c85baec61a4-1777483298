import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

const API_BASE_URL = "https://api.gatcg.com";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("Starting card sync from Grand Archive API...");

    // Step 1: Fetch and sync sets
    const setsResponse = await fetch(`${API_BASE_URL}/sets`);
    if (!setsResponse.ok) throw new Error("Failed to fetch sets");
    const setsData = await setsResponse.json();
    const sets: GATCGSet[] = setsData.data || [];

    console.log(`Found ${sets.length} sets`);

    // Insert sets into database
    for (const set of sets) {
      const { error } = await supabase
        .from("sets")
        .upsert({
          name: set.name,
          code: set.prefix,
          release_date: set.release_date || null,
        }, {
          onConflict: "code",
        });

      if (error) {
        console.error(`Error inserting set ${set.name}:`, error);
      }
    }

    // Step 2: Fetch all cards (paginated)
    let allCards: GATCGCard[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) { // Safety limit
      console.log(`Fetching page ${page}...`);
      const cardsResponse = await fetch(`${API_BASE_URL}/cards?page=${page}&per_page=100`);
      if (!cardsResponse.ok) break;

      const cardsData = await cardsResponse.json();
      const cards: GATCGCard[] = cardsData.data || [];

      if (cards.length === 0) {
        hasMore = false;
        break;
      }

      allCards = allCards.concat(cards);
      page++;

      // Break if we've fetched all cards
      if (cardsData.meta && cardsData.meta.current_page >= cardsData.meta.last_page) {
        hasMore = false;
      }
    }

    console.log(`Fetched ${allCards.length} total cards`);

    // Step 3: Get set IDs mapping
    const { data: dbSets } = await supabase.from("sets").select("id, code");
    const setIdMap = new Map(dbSets?.map((s) => [s.code, s.id]) || []);

    // Step 4: Insert cards into database
    let successCount = 0;
    let errorCount = 0;

    for (const card of allCards) {
      const setId = setIdMap.get(card.set.prefix);
      if (!setId) {
        console.error(`Set not found for card: ${card.name} (${card.set.prefix})`);
        errorCount++;
        continue;
      }

      const { error } = await supabase
        .from("cards")
        .upsert({
          name: card.name,
          set_id: setId,
          card_number: card.slug.split("-").pop() || "0",
          rarity: card.rarity.toLowerCase(),
          type: card.types[0] || "Unknown",
          element: card.element,
          cost: card.cost.memory || 0,
          power: card.power,
          life: card.life,
          effect_text: card.effect_text || "",
          flavor_text: card.flavor_text,
          image_url: card.image_url,
          illustrator: card.illustrator,
        }, {
          onConflict: "set_id, card_number",
        });

      if (error) {
        console.error(`Error inserting card ${card.name}:`, error);
        errorCount++;
      } else {
        successCount++;
      }
    }

    console.log(`Sync complete: ${successCount} cards synced, ${errorCount} errors`);

    return res.status(200).json({
      success: true,
      sets: sets.length,
      cards: allCards.length,
      synced: successCount,
      errors: errorCount,
    });
  } catch (error) {
    console.error("Error syncing cards:", error);
    return res.status(500).json({
      error: "Failed to sync cards",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}