import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

const API_BASE_URL = "https://api.gatcg.com";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("Starting card sync from Grand Archive API...");

    // Fetch all cards using pagination
    let allCards: GATCGCard[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`Fetching page ${page} from /cards/search...`);
      const response = await fetch(`${API_BASE_URL}/cards/search?page=${page}&limit=100`);
      
      if (!response.ok) {
        console.error(`Failed to fetch page ${page}: ${response.status}`);
        break;
      }

      const data = await response.json();
      const cards: GATCGCard[] = data.data || [];
      
      console.log(`Page ${page}: Got ${cards.length} cards, hasNext: ${data.next || false}`);
      
      if (cards.length === 0) {
        hasMore = false;
        break;
      }

      allCards = allCards.concat(cards);
      hasMore = data.next || false;
      page++;

      // Safety limit
      if (page > 100) break;
    }

    console.log(`Total cards fetched: ${allCards.length}`);

    // Extract unique sets from card editions
    const setsMap = new Map<string, { name: string; code: string }>();
    
    for (const card of allCards) {
      if (card.editions && card.editions.length > 0) {
        for (const edition of card.editions) {
          if (edition.set && !setsMap.has(edition.set)) {
            setsMap.set(edition.set, {
              name: edition.set,
              code: edition.set,
            });
          }
        }
      }
    }

    console.log(`Found ${setsMap.size} unique sets`);

    // Insert sets into database
    for (const [code, setInfo] of setsMap) {
      const { error } = await supabase
        .from("sets")
        .upsert({
          name: setInfo.name,
          code: setInfo.code,
          release_date: null,
        }, {
          onConflict: "code",
        });

      if (error) {
        console.error(`Error inserting set ${setInfo.name}:`, error);
      }
    }

    // Get set IDs mapping
    const { data: dbSets } = await supabase.from("sets").select("id, code");
    const setIdMap = new Map(dbSets?.map((s) => [s.code, s.id]) || []);

    // Insert cards into database
    let successCount = 0;
    let errorCount = 0;

    for (const card of allCards) {
      // Get the first edition for this card
      const firstEdition = card.editions && card.editions.length > 0 ? card.editions[0] : null;
      
      if (!firstEdition) {
        console.log(`Skipping card ${card.name}: no editions`);
        errorCount++;
        continue;
      }

      const setId = setIdMap.get(firstEdition.set);
      if (!setId) {
        console.error(`Set not found for card: ${card.name} (${firstEdition.set})`);
        errorCount++;
        continue;
      }

      // Format rarity to match database constraint
      const rarityFormatted = card.rarity?.toLowerCase().replace(/\s+/g, '_') || 'common';

      const { error } = await supabase
        .from("cards")
        .upsert({
          name: card.name,
          set_id: setId,
          card_number: firstEdition.collector_number || "0",
          rarity: rarityFormatted,
          card_type: card.types && card.types.length > 0 ? card.types[0] : "Unknown",
          class: card.classes && card.classes.length > 0 ? card.classes[0] : null,
          element: null, // Not present in this API structure
          cost: card.cost_memory || 0,
          power: card.power,
          life: card.life,
          effect_text: card.effect_text || card.effect_raw || "",
          flavor_text: card.flavor,
          image_url: card.image ? `https://api.gatcg.com${card.image}` : null,
          illustrator: card.illustrator,
        }, {
          onConflict: "set_id, card_number",
        });

      if (error) {
        console.error(`Error inserting card ${card.name}:`, error.message);
        errorCount++;
      } else {
        successCount++;
      }
    }

    console.log(`Sync complete: ${successCount} cards synced, ${errorCount} errors`);

    return res.status(200).json({
      success: true,
      sets: setsMap.size,
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