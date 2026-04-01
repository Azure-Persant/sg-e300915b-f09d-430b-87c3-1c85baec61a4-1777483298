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

    // Step 4: Insert cards into database
    let successCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    console.log(`Starting to insert ${allCards.length} cards...`);

    for (const card of allCards) {
      try {
        // Find the set for this card's first edition
        const firstEdition = card.editions?.[0];
        if (!firstEdition) {
          console.log(`Card ${card.name} has no editions, skipping`);
          errorCount++;
          continue;
        }

        const setCode = firstEdition.set;
        const setId = setIdMap.get(setCode);
        
        if (!setId) {
          console.error(`Set not found for card: ${card.name} (${setCode})`);
          errorCount++;
          errors.push({ card: card.name, reason: `Set ${setCode} not found in map` });
          continue;
        }

        // Format rarity to match the CHECK constraint
        const rarityFormatted = card.rarity?.toLowerCase().replace(/\s+/g, '_') || 'common';
        
        // Get the first class if available
        const cardClass = card.classes && card.classes.length > 0 ? card.classes[0] : null;
        
        // Get the first type if available
        const cardType = card.types && card.types.length > 0 ? card.types[0] : 'Unknown';

        // Convert relative image path to full URL
        const imageUrl = card.image?.startsWith('http') 
          ? card.image 
          : `https://index.gatcg.com${card.image}`;

        const cardData = {
          name: card.name,
          set_id: setId,
          card_number: firstEdition.collector_number || "0",
          rarity: rarityFormatted,
          card_type: cardType,
          class: cardClass,
          element: null, // Grand Archive doesn't use elements like we defined
          cost: card.cost_memory || 0,
          power: card.power,
          life: card.life,
          effect_text: card.effect_text || card.effect_raw || "",
          flavor_text: card.flavor || null,
          image_url: imageUrl,
          illustrator: card.illustrator,
        };

        console.log(`Inserting card: ${card.name} (${rarityFormatted}, ${cardType})`);

        const { error } = await supabase
          .from("cards")
          .upsert(cardData, {
            onConflict: "set_id,card_number",
          });

        if (error) {
          console.error(`Error inserting card ${card.name}:`, error);
          errorCount++;
          errors.push({ card: card.name, error: error.message });
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`Exception inserting card ${card.name}:`, err);
        errorCount++;
        errors.push({ card: card.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    console.log(`Sync complete: ${successCount} successful, ${errorCount} errors`);
    if (errors.length > 0) {
      console.log("First 10 errors:", errors.slice(0, 10));
    }

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